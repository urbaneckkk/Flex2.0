# -*- coding: utf-8 -*-
"""
model_repository.py — FlexGestor ML
Salva e carrega os 3 modelos treinados usando joblib.
Cada modelo tem seu próprio arquivo .pkl para facilitar retreino independente.
"""

import os
import joblib

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)


class ModelRepository:

    MODELOS = {
        "cancelamento":  "model_cancelamento.pkl",
        "inadimplencia": "model_inadimplencia.pkl",
        "estoque":       "model_estoque.pkl",
    }

    def salvar(self, nome: str, model, scaler, features: list, encoders: dict):
        """
        Salva todos os artefatos de um modelo em um único arquivo .pkl.
        nome: 'cancelamento' | 'inadimplencia' | 'estoque'
        """
        if nome not in self.MODELOS:
            raise ValueError(f"Modelo '{nome}' não reconhecido. Use: {list(self.MODELOS.keys())}")

        payload = {
            "model":    model,
            "scaler":   scaler,
            "features": features,
            "encoders": encoders,
        }
        path = os.path.join(MODELS_DIR, self.MODELOS[nome])
        joblib.dump(payload, path)
        print(f"[ModelRepository] Salvo: {path}")

    def carregar(self, nome: str) -> tuple:
        """
        Carrega e retorna (model, scaler, features, encoders).
        Lança FileNotFoundError se o modelo ainda não foi treinado.
        """
        if nome not in self.MODELOS:
            raise ValueError(f"Modelo '{nome}' não reconhecido.")

        path = os.path.join(MODELS_DIR, self.MODELOS[nome])
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Modelo '{nome}' não encontrado em {path}. "
                f"Execute main.py para treinar primeiro."
            )

        payload  = joblib.load(path)
        return payload["model"], payload["scaler"], payload["features"], payload["encoders"]

    def modelo_existe(self, nome: str) -> bool:
        path = os.path.join(MODELS_DIR, self.MODELOS.get(nome, ""))
        return os.path.exists(path)

    def listar_modelos(self) -> dict:
        """Retorna quais modelos já foram treinados."""
        return {nome: self.modelo_existe(nome) for nome in self.MODELOS}