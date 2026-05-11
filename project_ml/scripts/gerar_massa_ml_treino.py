# -*- coding: utf-8 -*-
"""
Gerador de massa de dados para treino dos modelos FlexGestor (pedidos/contas).

- Alinhamento com project_ml/Domain/data_loader.py (features agregadas no MySQL).
- Usa FLEXGESTOR_DB_URL.
- Stored procedures: sp_CriarItemPedido, sp_CriarContaReceber (opcional).
- Histórico: INSERT em PedidoStatusHistorico com dthAlteracao espalhada (a SP fixa NOW).
- INSERT direto: Pedido, Cliente, PedidoPagamento (como nos repositórios .NET).

Exemplo::
    cd project_ml
    $env:FLEXGESTOR_DB_URL="mysql+mysqlconnector://user:senha@host:porta/FlexGestor"
    python scripts/gerar_massa_ml_treino.py --id-empresa 1 --id-usuario 2 \\
        --pedidos 800 --pct-cancelado 0.32 --seed 7

Este script não aplica política completa do EstoqueService; serve para enriquecer
histórico e retreinar `main.py`. Em produção avalie usar uma base de QA separada.
"""

from __future__ import annotations

import argparse
import os
import random
import string
from datetime import datetime, timedelta
from typing import Dict, List, Sequence, Tuple

from sqlalchemy import create_engine, inspect, text

DEFAULT_DB_URL = os.getenv(
    "FLEXGESTOR_DB_URL",
    "mysql+mysqlconnector://root:password@127.0.0.1:3306/FlexGestor",
)

CANAIS = ["LOJA", "WHATSAPP", "SITE", "MERCADOLIVRE", "OUTROS", "MAGALU"]
GENEROS = ["M", "F", "N"]


def rng(seed: int | None) -> random.Random:
    return random.Random(seed)


def cols(engine, table: str) -> List[str]:
    return [c["name"] for c in inspect(engine).get_columns(table)]


def filtered_row(engine, table: str, row: Dict) -> Tuple[str, Tuple]:
    names = cols(engine, table)
    kv = [(k, row[k]) for k in names if k in row and row[k] is not None]
    if not kv:
        raise RuntimeError(f"Nenhuma coluna válida para {table}: {sorted(row)!r}")
    csql = "(" + ",".join(f"`{x[0]}`" for x in kv) + ")"
    ph = "(" + ",".join(["%s"] * len(kv)) + ")"
    return f"INSERT INTO `{table}` {csql} VALUES {ph}", tuple(x[1] for x in kv)


def fetch_produtos(engine, id_empresa: int) -> List[int]:
    q = text(
        """
        SELECT idProduto FROM Produto
        WHERE idEmpresa = :e AND COALESCE(fAtivo, 1) = 1
        ORDER BY idProduto DESC
        LIMIT 400
        """
    )
    with engine.connect() as c:
        return [int(r[0]) for r in c.execute(q, {"e": id_empresa}).fetchall()]


def fetch_formas(engine) -> List[int]:
    q = text("SELECT idFormaPagamento FROM FormaPagamento WHERE COALESCE(fAtivo,1)=1 LIMIT 30")
    with engine.connect() as c:
        out = [int(r[0]) for r in c.execute(q).fetchall()]
    return out if out else [1]


def cliente_nome_field(cliente_cols: Sequence[str]) -> str:
    for cand in ("nome", "Nome", "nomeCliente"):
        if cand in cliente_cols:
            return cand
    raise RuntimeError("Tabela Cliente sem campo de nome esperado")


def sintetiza_pedido(
    cur,
    engine,
    r: random.Random,
    *,
    id_empresa: int,
    id_usuario: int,
    cliente_id: int,
    produtos: Sequence[int],
    formas_pg: Sequence[int],
    seq: int,
    d_ped: datetime,
    cancelar: bool,
) -> int:
    picks = r.sample(list(produtos), r.randint(1, min(5, len(produtos))))

    valor_itens = 0.0
    item_rows = []

    for pid in picks:
        qtd = r.randint(1, 14)
        vu = round(r.uniform(6, 420), 2)
        dsc = round(r.choice([0, 0, 0, vu * r.uniform(0, 0.08)]), 2)
        vt = round(qtd * vu - dsc, 2)
        valor_itens += vt
        item_rows.append((pid, qtd, vu, dsc, vt))

    frete = round(r.choice([0, 0, 10, 19.9, 49.9]), 2)
    desc_pedido = round(valor_itens * r.choice([0, 0, 0.02, r.uniform(0.02, 0.12)]), 2)
    total = round(max(valor_itens + frete - desc_pedido, 1.5), 2)

    stat = 6 if cancelar else r.choice([2, 3, 4, 5])

    pedido_dict = {
        "idEmpresa": id_empresa,
        "cliente_id": cliente_id,
        "usuario_id": id_usuario,
        "endereco_id": None,
        "canal": r.choice(CANAIS),
        "numeroExterno": f"EXTSYN-{seq:09d}-{r.randint(10,9999)}",
        "statusPedido_id": stat,
        "valorTotal": total,
        "valorFrete": frete,
        "Desconto": desc_pedido,
        "dthPedido": d_ped,
        "observacao": f"Massa sintética ML #{seq}",
    }

    stmt, vals = filtered_row(engine, "Pedido", pedido_dict)
    cur.execute(stmt, vals)
    id_pedido = cur.lastrowid

    for p_prod, qtd, vu, dsc, vt in item_rows:
        cur.callproc(
            "sp_CriarItemPedido",
            [int(id_pedido), int(p_prod), int(qtd), float(vu), float(dsc), float(vt)],
        )
        _drain_procedure_results(cur)

    # Histórico: INSERT direto com datas relativas ao dthPedido (a SP usa NOW e zeraria diasNoFunil).
    hcols = cols(engine, "PedidoStatusHistorico")
    campo_usuario = "idUsuario" if "idUsuario" in hcols else ("usuario_id" if "usuario_id" in hcols else None)
    campo_data = None
    for cand in ("dthAlteracao", "DthAlteracao"):
        if cand in hcols:
            campo_data = cand
            break

    campo_obs = "observacao" if "observacao" in hcols else ("Observacao" if "Observacao" in hcols else None)

    linhas_hist = max(2, min(14, abs(int(round(r.gauss(5, 2))))))
    stat_pool = sorted({1, stat})
    for hi in range(linhas_hist):
        esc = stat_pool[0] if hi == 0 else r.choice(stat_pool + stat_pool)
        if cancelar and hi == linhas_hist - 1:
            esc = 6

        dias_off = hi * abs(int(round(r.gauss(1.6, 0.8))))
        quando = max(d_ped, min(datetime.now(), d_ped + timedelta(days=min(400, dias_off))))

        inserts = []
        vals = []
        if "idPedido" in hcols:
            inserts.append("`idPedido`=%s")
            vals.append(int(id_pedido))
        stat_col = (
            "statusPedido_id" if "statusPedido_id" in hcols
            else "status_pedido_id" if "status_pedido_id" in hcols
            else None
        )
        if stat_col:
            inserts.append(f"`{stat_col}`=%s")
            vals.append(int(esc))

        if campo_usuario:
            inserts.append(f"`{campo_usuario}`=%s")
            vals.append(int(id_usuario))
        if campo_data:
            inserts.append(f"`{campo_data}`=%s")
            vals.append(quando)
        if campo_obs:
            inserts.append(f"`{campo_obs}`=%s")
            vals.append(f"Synth hist #{hi}")

        cols_sql = ", ".join(inserts)
        sql_hist = "INSERT INTO PedidoStatusHistorico SET " + cols_sql
        cur.execute(sql_hist, vals)

    nf = min(len(formas_pg), r.randint(1, min(4, len(formas_pg))))
    parc = list(r.sample(list(formas_pg), nf))
    restante = total
    for idx_fp, fid in enumerate(parc):
        if idx_fp == len(parc) - 1:
            valor = round(restante, 2)
        else:
            valor = round(restante * r.uniform(0.25, 0.72), 2)
            valor = max(0.01, min(valor, restante - 0.05 * (nf - idx_fp - 1)))
            restante = round(restante - valor, 2)
        valor = max(0.01, valor)
        cur.execute(
            """
            INSERT INTO PedidoPagamento (idPedido, formaPagamento_id, valor, dthPagamento)
            VALUES (%s,%s,%s,%s)
            """,
            (int(id_pedido), int(fid), float(valor), datetime.now()),
        )

    return int(id_pedido)


def _drain_procedure_results(cur):
    """mysql-connector pode retornar múltiplos resultsets após CALL."""
    try:
        for _ in cur.stored_results():
            pass
    except Exception:
        pass
    while cur.nextset():
        pass


def opcional_conta(cur, engine, rng: random.Random, *, id_empresa: int,
                   cliente_pool: Sequence[int], pedido_pool: Sequence[int],
                   inadpl: bool, d_emissao: datetime):
    cliente_id = int(rng.choice(list(cliente_pool)))
    pid = rng.choice([None] + list(pedido_pool))
    valor = round(rng.uniform(40, 4500), 2)
    prazo_dias = rng.randint(10, 80)
    venc = (d_emissao + timedelta(days=prazo_dias)).date()

    cur.callproc(
        "sp_CriarContaReceber",
        (
            id_empresa,
            cliente_id,
            pid,
            None,
            "Synth ML financeiro",
            float(valor),
            venc,
        ),
    )
    _drain_procedure_results(cur)
    cur.execute("SELECT LAST_INSERT_ID()")
    row = cur.fetchone()
    if not row:
        return
    id_cr = int(row[0])

    cnames = set(cols(engine, "ContaReceber"))
    if inadpl and "valorPago" in cnames:
        if "dthPagamento" in cnames:
            cur.execute(
                """
                UPDATE ContaReceber
                SET valorPago=%s, dthPagamento=NULL
                WHERE idContaReceber=%s
                LIMIT 1
                """,
                (0.0, id_cr),
            )
        else:
            cur.execute(
                "UPDATE ContaReceber SET valorPago=%s WHERE idContaReceber=%s LIMIT 1",
                (0.0, id_cr),
            )
    elif not inadpl and "valorPago" in cnames:
        pag = datetime.combine(venc + timedelta(days=rng.randint(-2, 15)), datetime.min.time())
        if "dthPagamento" in cnames:
            cur.execute(
                """
                UPDATE ContaReceber
                SET valorPago=%s, dthPagamento=%s
                WHERE idContaReceber=%s
                LIMIT 1
                """,
                (float(valor), pag, id_cr),
            )
        else:
            cur.execute(
                "UPDATE ContaReceber SET valorPago=%s WHERE idContaReceber=%s LIMIT 1",
                (float(valor), id_cr),
            )

    if "dthCriacao" in cnames:
        cur.execute(
            "UPDATE ContaReceber SET dthCriacao=%s WHERE idContaReceber=%s LIMIT 1",
            (d_emissao, id_cr),
        )
    elif "dataCriacao" in cnames:
        cur.execute(
            "UPDATE ContaReceber SET dataCriacao=%s WHERE idContaReceber=%s LIMIT 1",
            (d_emissao, id_cr),
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=DEFAULT_DB_URL)
    ap.add_argument("--id-empresa", type=int, required=True)
    ap.add_argument("--id-usuario", type=int, required=True)
    ap.add_argument("--pedidos", type=int, default=200)
    ap.add_argument("--pct-cancelado", type=float, default=0.30)
    ap.add_argument("--contas-receber", type=int, default=0)
    ap.add_argument("--pct-inadimplente-forcado", type=float, default=0.34)
    ap.add_argument("--dias-retroativos-max", type=int, default=520)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--commit-a-cada", type=int, default=80)
    args = ap.parse_args()

    if args.pedidos <= 0 and args.contas_receber > 0:
        raise SystemExit("Use --pedidos > 0 para criar clientes antes de --contas-receber.")

    r = rng(args.seed)
    engine = create_engine(args.db_url, pool_pre_ping=True)
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception as exc:
        raise SystemExit(
            "Falha ao conectar no MySQL com --db-url/FLEXGESTOR_DB_URL.\n"
            f"URL atual: {args.db_url}\n"
            "No PowerShell use:\n"
            '  $env:FLEXGESTOR_DB_URL="mysql+mysqlconnector://user:senha@host:porta/FlexGestor"\n'
            "Depois rode novamente o script.\n"
            f"Detalhe: {exc}"
        ) from exc

    cliente_cols_set = cols(engine, "Cliente")
    nomecampo = cliente_nome_field(cliente_cols_set)

    produtos = fetch_produtos(engine, args.id_empresa)
    formas = fetch_formas(engine)
    if not produtos:
        raise SystemExit("Sem produtos ativos para esta empresa.")

    clientes_ids: List[int] = []
    pedidos_ids: List[int] = []

    seq = int(r.randint(100_001, 8_888_887))
    commit_n = max(1, args.commit_a_cada)

    raw = engine.raw_connection()
    cur = raw.cursor()

    try:
        for _ in range(args.pedidos):
            seq += 1

            nome, mail = random_cliente_tuple(r, seq)

            g = r.choice(GENEROS)
            cliente = {
                nomecampo: nome,
                "idEmpresa": args.id_empresa,
                "cpfCNPJ": random_doc(r, seq),
                "email": mail,
                "telefone": f"559{r.randint(700000000, 999999999)}",
                "tipoCliente_id": r.choice([1, 2, 3]),
                "dthCadastro": datetime.now() - timedelta(days=r.randint(20, 4000)),
                "fAtivo": 1,
                "saldoDevedor": round(r.uniform(0, 1200), 2),
                "observacao": None,
                "nomeFantasia": nome[:120],
                "razaoSocial": nome[:160],
                "enderecoId": None,
                "dthNascimento": None,
            }
            if "Genero" in cliente_cols_set:
                cliente["Genero"] = g
            elif "genero" in cliente_cols_set:
                cliente["genero"] = g

            for opt in ("email", "observacao", "nomeFantasia", "razaoSocial", "dthNascimento", "enderecoId"):
                if opt not in cliente_cols_set:
                    cliente.pop(opt, None)
            cliente = {k: v for k, v in cliente.items() if k in cliente_cols_set}
            stmt, vals = filtered_row(engine, "Cliente", cliente)
            cur.execute(stmt, vals)
            cli_id = cur.lastrowid

            dias_atras = r.randint(1, max(1, args.dias_retroativos_max))
            d_ped = datetime.now() - timedelta(days=dias_atras)

            cancel = r.random() < args.pct_cancelado
            id_pedido = sintetiza_pedido(
                cur,
                engine,
                r,
                id_empresa=args.id_empresa,
                id_usuario=args.id_usuario,
                cliente_id=int(cli_id),
                produtos=produtos,
                formas_pg=formas,
                seq=seq,
                d_ped=d_ped,
                cancelar=cancel,
            )

            clientes_ids.append(int(cli_id))
            pedidos_ids.append(int(id_pedido))

            if len(pedidos_ids) % commit_n == 0:
                raw.commit()

        # Contas opcionais
        for j in range(args.contas_receber):
            inadimpl = r.random() < args.pct_inadimplente_forcado
            d_em = datetime.now() - timedelta(days=r.randint(1, args.dias_retroativos_max))
            opcional_conta(
                cur,
                engine,
                r,
                id_empresa=args.id_empresa,
                cliente_pool=tuple(set(clientes_ids)),
                pedido_pool=tuple(pedidos_ids),
                inadpl=inadimpl,
                d_emissao=d_em,
            )
            if (j + 1) % commit_n == 0:
                raw.commit()

        raw.commit()
    finally:
        cur.close()
        raw.close()

    print(f"Pronto: {args.pedidos} pedidos (+ clientes/itens/hist./pagamentos) na empresa {args.id_empresa}.")
    if args.contas_receber:
        print(f"Também: {args.contas_receber} contas a receber (ajuste pontual valorPago/data).")


if __name__ == "__main__":
    main()
