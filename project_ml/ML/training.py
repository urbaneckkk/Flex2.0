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
        """
        Faz train/test split estratificado (mantém proporção de classes)
        e treina o modelo.
        """
        # Estratificado: garante que a proporção de cancelados/não-cancelados
        # seja igual no treino e no teste (importante para datasets desbalanceados)
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y,
            test_size=0.2,
            random_state=42,
            stratify=y,           # ← fundamental para datasets desbalanceados
        )
        self.model.fit(self.X_train, self.y_train)
        print(f"[{self.nome}] Treinado com {len(self.X_train)} amostras.")
        return self.model

    def validar_cruzado(self, X, y, folds: int = 5) -> dict:
        """
        Cross-validation com k-folds estratificado.
        Retorna média e desvio padrão do ROC-AUC.
        Útil para ter uma estimativa mais confiável antes de subir para produção.
        """
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
        scores = cross_val_score(self.model, X, y, cv=cv, scoring="roc_auc")
        resultado = {
            "roc_auc_medio": round(float(scores.mean()), 4),
            "roc_auc_std":   round(float(scores.std()),  4),
            "folds":         folds,
        }
        print(f"[{self.nome}] Cross-val ROC-AUC: {resultado['roc_auc_medio']} ± {resultado['roc_auc_std']}")
        return resultado