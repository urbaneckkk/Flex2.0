# -*- coding: utf-8 -*-
"""
main.py — FlexGestor ML
Orquestra o treino completo dos 3 modelos.
Execute uma vez após instalar as dependências e configurar a string de conexão.

Uso:
    python main.py                    # treina todos os modelos
    python main.py --modelo cancelamento  # retreina só um
"""

import sys
import argparse

from Domain.data_loader import DataLoader
from ML.preprocessing   import PreprocessorCancelamento, PreprocessorInadimplencia, PreprocessorEstoque
from ML.training        import Trainer
from ML.evaluation      import Evaluator
from Persistence.model_repository import ModelRepository

# ─── Inicialização ────────────────────────────────────────
loader = DataLoader()
repo   = ModelRepository()
eval_  = Evaluator()

# ─── Argparse para retreino seletivo ──────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--modelo", choices=["cancelamento", "inadimplencia", "estoque", "todos"],
                    default="todos", help="Qual modelo treinar")
args = parser.parse_args()

modelos_para_treinar = (
    ["cancelamento", "inadimplencia", "estoque"]
    if args.modelo == "todos"
    else [args.modelo]
)


# ─── MODELO 1: Cancelamento de Pedido ────────────────────
if "cancelamento" in modelos_para_treinar:
    print("\n" + "="*50)
    print("MODELO 1 — Cancelamento de Pedido")
    print("="*50)

    df = loader.carregar_pedidos()
    print(f"Dataset: {len(df)} pedidos | Cancelados: {df['cancelado'].sum()} ({df['cancelado'].mean()*100:.1f}%)")

    prep    = PreprocessorCancelamento()
    X, y, features = prep.preprocessar(df)

    trainer = Trainer("cancelamento")
    model   = trainer.treinar(X, y)

    metricas, matriz = eval_.avaliar(model, trainer.X_test, trainer.y_test)
    print("Métricas:")
    for k, v in metricas.items():
        print(f"  {k}: {v}")
    print(f"Matriz de confusão:\n{matriz}")

    # Cross-validation para validação extra
    trainer.validar_cruzado(X, y)

    repo.salvar("cancelamento", model, prep.scaler, features, prep.encoders)


# ─── MODELO 2: Inadimplência ──────────────────────────────
if "inadimplencia" in modelos_para_treinar:
    print("\n" + "="*50)
    print("MODELO 2 — Inadimplência de Cliente")
    print("="*50)

    df = loader.carregar_inadimplencia()
    print(f"Dataset: {len(df)} contas | Inadimplentes: {df['inadimplente'].sum()} ({df['inadimplente'].mean()*100:.1f}%)")

    prep    = PreprocessorInadimplencia()
    X, y, features = prep.preprocessar(df)

    trainer = Trainer("inadimplencia")
    model   = trainer.treinar(X, y)

    metricas, matriz = eval_.avaliar(model, trainer.X_test, trainer.y_test)
    print("Métricas:")
    for k, v in metricas.items():
        print(f"  {k}: {v}")
    print(f"Matriz de confusão:\n{matriz}")

    trainer.validar_cruzado(X, y)

    repo.salvar("inadimplencia", model, prep.scaler, features, prep.encoders)


# ─── MODELO 3: Ruptura de Estoque ────────────────────────
if "estoque" in modelos_para_treinar:
    print("\n" + "="*50)
    print("MODELO 3 — Ruptura de Estoque")
    print("="*50)

    df = loader.carregar_estoque_demanda()
    print(f"Dataset: {len(df)} produtos | Em ruptura: {df['emRuptura'].sum()} ({df['emRuptura'].mean()*100:.1f}%)")

    prep               = PreprocessorEstoque()
    X, y, features, _  = prep.preprocessar(df)

    trainer = Trainer("estoque")
    model   = trainer.treinar(X, y)

    metricas, matriz = eval_.avaliar(model, trainer.X_test, trainer.y_test)
    print("Métricas:")
    for k, v in metricas.items():
        print(f"  {k}: {v}")
    print(f"Matriz de confusão:\n{matriz}")

    trainer.validar_cruzado(X, y)

    repo.salvar("estoque", model, prep.scaler, features, prep.encoders)


print("\n✅ Treino concluído. Modelos salvos em /models/")
print("Modelos disponíveis:", repo.listar_modelos())