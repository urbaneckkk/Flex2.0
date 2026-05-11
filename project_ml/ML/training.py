# -*- coding: utf-8 -*-
"""
training.py — FlexGestor ML
Um Trainer genérico que qualquer modelo pode usar.
Hiperparâmetros otimizados para datasets pequenos (< 5k linhas),
que é o esperado nos primeiros meses de uso do FlexGestor.
"""

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
import numpy as np


class ConstantBinaryModel:
    """Fallback para datasets com apenas uma classe no target."""

    def __init__(self, classe_constante: int):
        self.classe_constante = int(classe_constante)

    def fit(self, X, y):
        return self

    def predict(self, X):
        return np.full(len(X), self.classe_constante, dtype=int)

    def predict_proba(self, X):
        n = len(X)
        probs = np.zeros((n, 2), dtype=float)
        probs[:, self.classe_constante] = 1.0
        return probs


class Trainer:
    """
    Trainer genérico — recebe X, y e treina um GradientBoostingClassifier.

    Por que GBM e não XGBoost?
      - Sem dependência extra (já está no scikit-learn)
      - Robusto com datasets pequenos e desbalanceados
      - Fácil de salvar com joblib

    Quando o dataset crescer (> 20k linhas), trocar para XGBoost/LightGBM.
    """

    def __init__(self, nome: str = "modelo"):
        self.nome  = nome
        self.model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,           # menor que o original (10) — evita overfitting em datasets pequenos
            min_samples_leaf=5,    # mínimo de amostras por folha — regularização
            subsample=0.8,         # usa 80% das amostras por árvore — mais robusto
            random_state=42,
        )
        self.X_train = None
        self.X_test  = None
        self.y_train = None
        self.y_test  = None

    def treinar(self, X, y):
        classes = np.unique(y)
        if len(classes) < 2:
            classe = int(classes[0]) if len(classes) else 0
            print(
                f"[{self.nome}] AVISO: target com 1 classe ({classe}). "
                "Usando modelo constante para não quebrar o pipeline."
            )
            self.model = ConstantBinaryModel(classe)
            self.X_train, self.X_test = X, X
            self.y_train, self.y_test = y, y
            self.model.fit(self.X_train, self.y_train)
            return self.model

        # Com menos de 10 amostras, usa tudo pra treino (sem test split)
        if len(X) < 10:
            print(f"[{self.nome}] AVISO: apenas {len(X)} amostras — usando tudo para treino.")
            self.X_train, self.X_test = X, X
            self.y_train, self.y_test = y, y
            self.model.fit(self.X_train, self.y_train)
            return self.model

        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y,
        )
        self.model.fit(self.X_train, self.y_train)
        print(f"[{self.nome}] Treinado com {len(self.X_train)} amostras.")
        return self.model

    def validar_cruzado(self, X, y, folds: int = 5) -> dict:
        if len(np.unique(y)) < 2:
            print(f"[{self.nome}] Cross-val ignorado — target com apenas 1 classe.")
            return {}

        # Pula validacao cruzada se nao tiver amostras suficientes
        min_amostras = folds * 2
        if len(X) < min_amostras:
            print(f"[{self.nome}] Cross-val ignorado — amostras insuficientes ({len(X)} < {min_amostras})")
            return {}

        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
        scores = cross_val_score(self.model, X, y, cv=cv, scoring="roc_auc")
        resultado = {
            "roc_auc_medio": round(float(scores.mean()), 4),
            "roc_auc_std":   round(float(scores.std()),  4),
            "folds":         folds,
        }
        print(f"[{self.nome}] Cross-val ROC-AUC: {resultado['roc_auc_medio']} +/- {resultado['roc_auc_std']}")
        return resultado