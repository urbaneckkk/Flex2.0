# -*- coding: utf-8 -*-
"""
preprocessing.py — FlexGestor ML
Responsável por limpar, encodar e escalar cada um dos 3 datasets.
Cada dataset tem seu próprio Preprocessor porque as features são muito diferentes.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler


# ──────────────────────────────────────────────
# DATASET 1 — Cancelamento de Pedido
# ──────────────────────────────────────────────
class PreprocessorCancelamento:
    """
    Features categóricas: canal, generoCliente
    Features numéricas  : tudo mais
    Target              : cancelado (0/1)
    """

    CATEGORICAS = ["canal", "generoCliente"]
    NUMERICAS = [
        "valorTotal", "valorFrete", "Desconto",
        "tipoCliente_id", "saldoDevedor", "diasClienteCadastrado",
        "totalItens", "totalUnidades", "descontoMedioItem",
        "maiorValorUnitario", "mudancasStatus", "diasNoFunil",
        "formasPagamentoUsadas", "totalPago",
        "diaSemana", "mes",
    ]

    def __init__(self):
        self.encoders = {}
        self.scaler   = StandardScaler()
        self.features  = None

    def preprocessar(self, df: pd.DataFrame):
        df = df.copy()

        # Remove linhas sem target
        df = df.dropna(subset=["cancelado"])

        # Preenche nulos com mediana/moda antes de encodar
        for col in self.NUMERICAS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df[col] = df[col].fillna(df[col].median())

        # Label Encode categóricas
        for col in self.CATEGORICAS:
            if col in df.columns:
                df[col] = df[col].astype(str).fillna("desconhecido")
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col])
                self.encoders[col] = le

        self.features = self.NUMERICAS + self.CATEGORICAS
        # Só inclui features que existem no df
        self.features = [f for f in self.features if f in df.columns]

        X = df[self.features].values
        y = df["cancelado"].astype(int).values

        X = self.scaler.fit_transform(X)
        return X, y, self.features


# ──────────────────────────────────────────────
# DATASET 2 — Inadimplência de Cliente
# ──────────────────────────────────────────────
class PreprocessorInadimplencia:
    """
    Features categóricas: Genero, canalOrigem
    Features numéricas  : tudo mais
    Target              : inadimplente (0/1)
    """

    CATEGORICAS = ["Genero", "canalOrigem"]
    NUMERICAS = [
        "valorTotal", "prazoConcessao",
        "tipoCliente_id", "saldoDevedor", "idadeClienteDias",
        "qtdContasAnteriores", "qtdAtrasoAnteriores",
        "valorPedidoOrigem", "mes",
    ]

    def __init__(self):
        self.encoders = {}
        self.scaler   = StandardScaler()
        self.features  = None

    def preprocessar(self, df: pd.DataFrame):
        df = df.copy()
        df = df.dropna(subset=["inadimplente"])

        for col in self.NUMERICAS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df[col] = df[col].fillna(df[col].median())

        for col in self.CATEGORICAS:
            if col in df.columns:
                df[col] = df[col].astype(str).fillna("N")
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col])
                self.encoders[col] = le

        self.features = self.NUMERICAS + self.CATEGORICAS
        self.features = [f for f in self.features if f in df.columns]

        X = df[self.features].values
        y = df["inadimplente"].astype(int).values

        X = self.scaler.fit_transform(X)
        return X, y, self.features


# ──────────────────────────────────────────────
# DATASET 3 — Ruptura de Estoque
# ──────────────────────────────────────────────
class PreprocessorEstoque:
    """
    Features categóricas: nomeCategoria
    Features numéricas  : tudo mais
    Target              : emRuptura (0/1)

    Nota: também mantemos colunas de identificação (idProduto, idEmpresa)
    fora do X para retornar junto com a predição.
    """

    CATEGORICAS = ["nomeCategoria"]
    NUMERICAS = [
        "precoCusto", "precoVenda", "margemBruta",
        "estoqueAtual", "estoqueMinimo", "estoqueMaximo",
        "vendido30d", "vendido90d", "receita30d", "receita90d",
        "giroDiario", "diasEstoqueRestante", "entradas90d",
    ]
    ID_COLS = ["idProduto", "idEmpresa"]

    def __init__(self):
        self.encoders = {}
        self.scaler   = StandardScaler()
        self.features  = None

    def preprocessar(self, df: pd.DataFrame):
        df = df.copy()
        df = df.dropna(subset=["emRuptura"])

        # Guarda IDs antes de transformar
        ids = df[self.ID_COLS].copy() if all(c in df.columns for c in self.ID_COLS) else None

        # Substitui 9999 (dias infinitos) por valor alto mas razoável
        if "diasEstoqueRestante" in df.columns:
            df["diasEstoqueRestante"] = df["diasEstoqueRestante"].replace(9999, 365)

        for col in self.NUMERICAS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df[col] = df[col].fillna(0)

        for col in self.CATEGORICAS:
            if col in df.columns:
                df[col] = df[col].astype(str).fillna("Sem Categoria")
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col])
                self.encoders[col] = le

        self.features = self.NUMERICAS + self.CATEGORICAS
        self.features = [f for f in self.features if f in df.columns]

        X = df[self.features].values
        y = df["emRuptura"].astype(int).values

        X = self.scaler.fit_transform(X)
        return X, y, self.features, ids