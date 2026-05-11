# -*- coding: utf-8 -*-
"""
Domain/data_loader.py — FlexGestor ML
Carrega dados do MySQL (Railway) para os 3 modelos.
A string de conexão vem da variável de ambiente FLEXGESTOR_DB_URL,
a mesma que o ASP.NET usa — não duplica config.
"""

import os
import pandas as pd
from sqlalchemy import create_engine, text

DB_URL = os.getenv(
    "FLEXGESTOR_DB_URL",
    "mysql+mysqlconnector://root:XpqAjrmizTqhGUBlfIqszKWqOyNmItya@turntable.proxy.rlwy.net:27476/FlexGestor"
)


class DataLoader:
    def __init__(self):
        self.engine = create_engine(DB_URL, pool_pre_ping=True)

    # ──────────────────────────────────────────
    # DATASET 1 — Pedidos (cancelamento)
    # ──────────────────────────────────────────
    def carregar_pedidos(self, id_empresa: int = None) -> pd.DataFrame:
        """
        Retorna pedidos finalizados com features agregadas para o modelo de cancelamento.
        id_empresa=None → carrega de todas as empresas (treino geral).
        id_empresa=N    → filtra por empresa (predição em tempo real).
        """
        filtro_empresa = "AND p.idEmpresa = :id_empresa" if id_empresa else ""

        query = text(f"""
            SELECT
                p.idPedido,
                p.idEmpresa,
                p.canal,
                p.valorTotal,
                COALESCE(p.valorFrete, 0)                     AS valorFrete,
                COALESCE(p.Desconto, 0)                       AS Desconto,
                p.statusPedido_id,

                CASE WHEN p.statusPedido_id = 6 THEN 1 ELSE 0 END AS cancelado,

                -- cliente
                COALESCE(c.tipoCliente_id, 0)                 AS tipoCliente_id,
                COALESCE(c.Genero, 'N')                       AS generoCliente,
                COALESCE(c.saldoDevedor, 0)                   AS saldoDevedor,
                DATEDIFF(p.dthPedido, c.dthCadastro)          AS diasClienteCadastrado,

                -- itens (agregados)
                COUNT(DISTINCT pi.idPedidoItem)               AS totalItens,
                COALESCE(SUM(pi.quantidade), 0)               AS totalUnidades,
                COALESCE(AVG(pi.desconto), 0)                 AS descontoMedioItem,
                COALESCE(MAX(pi.valorUnitario), 0)            AS maiorValorUnitario,

                -- histórico de status
                COUNT(DISTINCT h.idHistorico)                 AS mudancasStatus,
                COALESCE(DATEDIFF(
                    MAX(h.dthAlteracao),
                    MIN(h.dthAlteracao)
                ), 0)                                         AS diasNoFunil,

                -- pagamento
                COUNT(DISTINCT pp.idPagamento)                AS formasPagamentoUsadas,
                COALESCE(SUM(pp.valor), 0)                    AS totalPago,

                -- temporal
                DAYOFWEEK(p.dthPedido)                        AS diaSemana,
                MONTH(p.dthPedido)                            AS mes

            FROM Pedido p
            INNER JOIN Cliente c ON c.idCliente = p.cliente_id
            LEFT  JOIN PedidoItem pi ON pi.idPedido = p.idPedido
            LEFT  JOIN PedidoStatusHistorico h ON h.idPedido = p.idPedido
            LEFT  JOIN PedidoPagamento pp ON pp.idPedido = p.idPedido

           WHERE p.statusPedido_id IS NOT NULL
            {filtro_empresa}

            GROUP BY
                p.idPedido, p.idEmpresa, p.canal, p.valorTotal,
                p.valorFrete, p.Desconto, p.statusPedido_id,
                c.tipoCliente_id, c.Genero, c.saldoDevedor,
                c.dthCadastro, p.dthPedido
        """)

        params = {"id_empresa": id_empresa} if id_empresa else {}
        return pd.read_sql(query, self.engine, params=params)

    # ──────────────────────────────────────────
    # DATASET 2 — Inadimplência
    # ──────────────────────────────────────────
    def carregar_inadimplencia(self, id_empresa: int = None) -> pd.DataFrame:
        filtro_empresa = "AND cr.idEmpresa = :id_empresa" if id_empresa else ""

        query = text(f"""
            SELECT
                cr.idContaReceber,
                cr.valorTotal,
                COALESCE(cr.valorPago, 0)                          AS valorPago,
                DATEDIFF(cr.dthVencimento, cr.dthCriacao)          AS prazoConcessao,

                CASE
                    WHEN COALESCE(cr.valorPago,0) < cr.valorTotal
                     AND cr.dthVencimento < CURDATE() THEN 1
                    ELSE 0
                END                                                AS inadimplente,

                COALESCE(c.tipoCliente_id, 0)                      AS tipoCliente_id,
                COALESCE(c.Genero, 'N')                            AS Genero,
                COALESCE(c.saldoDevedor, 0)                        AS saldoDevedor,
                DATEDIFF(cr.dthCriacao, c.dthCadastro)             AS idadeClienteDias,

                (SELECT COUNT(*) FROM ContaReceber cr2
                 WHERE cr2.cliente_id = c.idCliente
                   AND cr2.idContaReceber < cr.idContaReceber)     AS qtdContasAnteriores,

                (SELECT COUNT(*) FROM ContaReceber cr3
                 WHERE cr3.cliente_id = c.idCliente
                   AND cr3.idContaReceber < cr.idContaReceber
                   AND cr3.dthVencimento < cr3.dthPagamento)       AS qtdAtrasoAnteriores,

                COALESCE(p.valorTotal, 0)                          AS valorPedidoOrigem,
                COALESCE(p.canal, 'direto')                        AS canalOrigem,
                MONTH(cr.dthCriacao)                               AS mes

            FROM ContaReceber cr
            INNER JOIN Cliente c ON c.idCliente = cr.cliente_id
            LEFT  JOIN Pedido  p ON p.idPedido  = cr.pedido_id
            WHERE cr.fAtivo = 1
            {filtro_empresa}
        """)

        params = {"id_empresa": id_empresa} if id_empresa else {}
        return pd.read_sql(query, self.engine, params=params)

    # ──────────────────────────────────────────
    # DATASET 3 — Ruptura de Estoque
    # ──────────────────────────────────────────
    def carregar_estoque_demanda(self, id_empresa: int = None) -> pd.DataFrame:
        filtro_empresa = "WHERE pr.idEmpresa = :id_empresa AND pr.fAtivo = 1" if id_empresa \
                    else "WHERE pr.fAtivo = 1"

        query = text(f"""
            SELECT
                pr.idProduto,
                pr.idEmpresa,
                COALESCE(pr.precoCusto, 0)                         AS precoCusto,
                COALESCE(pr.precoVenda, 0)                         AS precoVenda,
                COALESCE(pr.precoVenda, 0) - COALESCE(pr.precoCusto, 0) AS margemBruta,

                COALESCE(e.QtdeAtual, 0)                           AS estoqueAtual,
                COALESCE(e.estoqueMin, 0)                          AS estoqueMinimo,
                COALESCE(e.estoqueMax, 0)                          AS estoqueMaximo,

                CASE
                    WHEN COALESCE(e.QtdeAtual, 0) <= COALESCE(e.estoqueMin, 0)
                    THEN 1 ELSE 0
                END                                                AS emRuptura,

                COALESCE(v30.totalVendido30d, 0)                   AS vendido30d,
                COALESCE(v30.receitaTotal30d, 0)                   AS receita30d,
                COALESCE(v90.totalVendido90d, 0)                   AS vendido90d,
                COALESCE(v90.receitaTotal90d, 0)                   AS receita90d,

                COALESCE(v90.totalVendido90d, 0) / 90.0            AS giroDiario,

                CASE
                    WHEN COALESCE(v90.totalVendido90d, 0) = 0 THEN 9999
                    ELSE COALESCE(e.QtdeAtual, 0) / (COALESCE(v90.totalVendido90d, 0) / 90.0)
                END                                                AS diasEstoqueRestante,

                COALESCE(ent.totalEntradas90d, 0)                  AS entradas90d,
                COALESCE(cp.Nome, 'Sem Categoria')                 AS nomeCategoria

            FROM Produto pr
            LEFT JOIN Estoque e
                ON e.produto_id = pr.idProduto AND e.idEmpresa = pr.idEmpresa
            LEFT JOIN CategoriaProduto cp
                ON cp.idCategoriaProduto = pr.categoriaProduto_id
            LEFT JOIN (
                SELECT pi.idProduto,
                       SUM(pi.quantidade) AS totalVendido30d,
                       SUM(pi.valorTotal) AS receitaTotal30d
                FROM PedidoItem pi
                JOIN Pedido p ON p.idPedido = pi.idPedido
                WHERE p.dthPedido >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                  AND p.statusPedido_id NOT IN (5, 6)
                GROUP BY pi.idProduto
            ) v30 ON v30.idProduto = pr.idProduto
            LEFT JOIN (
                SELECT pi.idProduto,
                       SUM(pi.quantidade) AS totalVendido90d,
                       SUM(pi.valorTotal) AS receitaTotal90d
                FROM PedidoItem pi
                JOIN Pedido p ON p.idPedido = pi.idPedido
                WHERE p.dthPedido >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                  AND p.statusPedido_id NOT IN (5, 6)
                GROUP BY pi.idProduto
            ) v90 ON v90.idProduto = pr.idProduto
            LEFT JOIN (
                SELECT m.produto_id, SUM(m.Qtde) AS totalEntradas90d
                FROM MovimentacaoEstoque m
                JOIN TipoMovimentacao t ON t.idTipoMovimentacao = m.tipoMovimentacao_id
                WHERE t.Nome = 'ENTRADA'
                  AND m.dthMovimentacao >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                GROUP BY m.produto_id
            ) ent ON ent.produto_id = pr.idProduto
            {filtro_empresa}
        """)

        params = {"id_empresa": id_empresa} if id_empresa else {}
        return pd.read_sql(query, self.engine, params=params)