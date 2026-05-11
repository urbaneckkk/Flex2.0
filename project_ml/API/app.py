# -*- coding: utf-8 -*-
"""
API/app.py — FlexGestor ML
Flask API que expõe os 3 modelos treinados para o FlexGestor (ASP.NET MVC).

Endpoints:
  POST /predict/cancelamento     → risco de cancelamento de um pedido
  POST /predict/inadimplencia    → risco de inadimplência de um cliente
  GET  /predict/ruptura/{idEmpresa} → produtos em risco de ruptura de estoque
  GET  /health                   → status da API e quais modelos estão carregados
  GET  /charts/list              → lista de gráficos EDA gerados
  GET  /charts/<filename>        → serve um gráfico
  POST /eda/regenerar            → regenera todos os gráficos EDA
  POST /retreinar/<modelo>       → retreina um modelo (uso interno/admin)
"""

import os
import sys
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from Persistence.model_repository import ModelRepository
from Domain.data_loader           import DataLoader
from ML.preprocessing             import (
    PreprocessorCancelamento,
    PreprocessorInadimplencia,
    PreprocessorEstoque,
)
from ML.eda import gerar_todos

app  = Flask(__name__)
CORS(app)  # Permite chamadas do ASP.NET MVC

CHARTS_DIR = os.path.join(BASE_DIR, "static", "charts")
repo       = ModelRepository()


# ─── Carrega modelos na inicialização ─────────────────────
# Se um modelo ainda não foi treinado, a rota correspondente
# retorna 503 em vez de quebrar toda a API.
modelos = {}
for nome in ["cancelamento", "inadimplencia", "estoque"]:
    try:
        model, scaler, features, encoders = repo.carregar(nome)
        modelos[nome] = {"model": model, "scaler": scaler,
                         "features": features, "encoders": encoders}
        print(f"[API] Modelo '{nome}' carregado.")
    except FileNotFoundError:
        print(f"[API] AVISO: Modelo '{nome}' ainda não treinado.")


def _encode_input(dados: dict, encoders: dict, features: list) -> pd.DataFrame:
    """
    Aplica os mesmos encoders usados no treino para um input de predição.
    Valores não vistos pelo encoder recebem -1.
    """
    for col, le in encoders.items():
        if col in dados:
            val = str(dados[col])
            dados[col] = int(le.transform([val])[0]) if val in le.classes_ else -1

    df = pd.DataFrame([dados], columns=features)
    df = df.fillna(0)
    return df


def _modelo_disponivel(nome: str):
    if nome not in modelos:
        return jsonify({
            "error": f"Modelo '{nome}' ainda não treinado. Execute main.py primeiro."
        }), 503
    return None


# ──────────────────────────────────────────────────────────
# ENDPOINT 1 — Cancelamento de Pedido
# ──────────────────────────────────────────────────────────
@app.route("/predict/cancelamento", methods=["POST"])
def predict_cancelamento():
    """
    Recebe dados de um pedido e retorna a probabilidade de cancelamento.

    Body JSON esperado (campos do pedido + contexto):
    {
      "canal": "Shopee",
      "valorTotal": 350.00,
      "valorFrete": 15.00,
      "Desconto": 0,
      "tipoCliente_id": 1,
      "generoCliente": "M",
      "saldoDevedor": 0,
      "diasClienteCadastrado": 120,
      "totalItens": 3,
      "totalUnidades": 5,
      "descontoMedioItem": 0,
      "maiorValorUnitario": 150.00,
      "mudancasStatus": 1,
      "diasNoFunil": 0,
      "formasPagamentoUsadas": 1,
      "totalPago": 350.00,
      "diaSemana": 3,
      "mes": 5
    }

    Retorna:
    {
      "probabilidade_cancelamento": 0.12,
      "risco": "BAIXO",           // BAIXO < 30% | MEDIO 30-60% | ALTO > 60%
      "label": "12% de chance de cancelamento"
    }
    """
    erro = _modelo_disponivel("cancelamento")
    if erro: return erro

    try:
        dados = request.get_json()
        m     = modelos["cancelamento"]
        df    = _encode_input(dados, m["encoders"], m["features"])
        X     = m["scaler"].transform(df)

        prob = round(float(m["model"].predict_proba(X)[0][1]), 4)

        risco = "BAIXO" if prob < 0.30 else "MEDIO" if prob < 0.60 else "ALTO"
        cor   = "#34d399" if risco == "BAIXO" else "#fbbf24" if risco == "MEDIO" else "#f87171"

        return jsonify({
            "probabilidade_cancelamento": prob,
            "risco":  risco,
            "cor":    cor,
            "label":  f"{round(prob * 100, 1)}% de chance de cancelamento",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ──────────────────────────────────────────────────────────
# ENDPOINT 2 — Inadimplência de Cliente
# ──────────────────────────────────────────────────────────
@app.route("/predict/inadimplencia", methods=["POST"])
def predict_inadimplencia():
    """
    Recebe dados de um cliente + contexto da conta a receber
    e retorna a probabilidade de inadimplência.

    Body JSON:
    {
      "valorTotal": 800.00,
      "prazoConcessao": 30,
      "tipoCliente_id": 2,
      "Genero": "F",
      "saldoDevedor": 150.00,
      "idadeClienteDias": 365,
      "qtdContasAnteriores": 3,
      "qtdAtrasoAnteriores": 1,
      "valorPedidoOrigem": 800.00,
      "canalOrigem": "WhatsApp",
      "mes": 5
    }

    Retorna:
    {
      "probabilidade_inadimplencia": 0.35,
      "risco": "MEDIO",
      "cor": "#fbbf24",
      "label": "35% de risco de inadimplência"
    }
    """
    erro = _modelo_disponivel("inadimplencia")
    if erro: return erro

    try:
        dados = request.get_json()
        m     = modelos["inadimplencia"]
        df    = _encode_input(dados, m["encoders"], m["features"])
        X     = m["scaler"].transform(df)

        prob  = round(float(m["model"].predict_proba(X)[0][1]), 4)
        risco = "BAIXO" if prob < 0.25 else "MEDIO" if prob < 0.55 else "ALTO"
        cor   = "#34d399" if risco == "BAIXO" else "#fbbf24" if risco == "MEDIO" else "#f87171"

        return jsonify({
            "probabilidade_inadimplencia": prob,
            "risco":  risco,
            "cor":    cor,
            "label":  f"{round(prob * 100, 1)}% de risco de inadimplência",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ──────────────────────────────────────────────────────────
# ENDPOINT 3 — Ruptura de Estoque (batch por empresa)
# ──────────────────────────────────────────────────────────
@app.route("/predict/ruptura/<int:id_empresa>", methods=["GET"])
def predict_ruptura(id_empresa: int):
    """
    Busca todos os produtos da empresa, calcula o risco de ruptura
    e retorna ordenado do maior risco para o menor.

    Retorna lista de:
    {
      "idProduto": 12,
      "probabilidade_ruptura": 0.88,
      "risco": "ALTO",
      "diasEstoqueRestante": 4.2,
      "giroDiario": 2.3,
      "estoqueAtual": 10
    }
    """
    erro = _modelo_disponivel("estoque")
    if erro: return erro

    try:
        loader = DataLoader()
        df_raw = loader.carregar_estoque_demanda(id_empresa=id_empresa)

        if df_raw.empty:
            return jsonify([])

        prep = PreprocessorEstoque()
        # Carrega encoders já treinados
        prep.encoders = modelos["estoque"]["encoders"]
        prep.features = modelos["estoque"]["features"]

        df = df_raw.copy()

        # Aplica encoders sem fit (já treinados)
        for col, le in prep.encoders.items():
            if col in df.columns:
                df[col] = df[col].astype(str).fillna("Sem Categoria")
                df[col] = df[col].apply(
                    lambda v: int(le.transform([v])[0]) if v in le.classes_ else -1
                )

        features = prep.features
        for col in features:
            if col not in df.columns:
                df[col] = 0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        # Substitui 9999
        if "diasEstoqueRestante" in df.columns:
            df["diasEstoqueRestante"] = df["diasEstoqueRestante"].replace(9999, 365)

        X = modelos["estoque"]["scaler"].transform(df[features].values)

        probs = modelos["estoque"]["model"].predict_proba(X)[:, 1]

        resultado = []
        for i, row in df_raw.iterrows():
            prob  = round(float(probs[i - df_raw.index[0]]), 4)
            risco = "BAIXO" if prob < 0.30 else "MEDIO" if prob < 0.65 else "ALTO"
            cor   = "#34d399" if risco == "BAIXO" else "#fbbf24" if risco == "MEDIO" else "#f87171"

            resultado.append({
                "idProduto":            int(row.get("idProduto", 0)),
                "probabilidade_ruptura": prob,
                "risco":                risco,
                "cor":                  cor,
                "diasEstoqueRestante":  round(float(row.get("diasEstoqueRestante", 0)), 1),
                "giroDiario":           round(float(row.get("giroDiario", 0)), 2),
                "estoqueAtual":         int(row.get("estoqueAtual", 0)),
                "estoqueMinimo":        int(row.get("estoqueMinimo", 0)),
                "vendido30d":           int(row.get("vendido30d", 0)),
            })

        # Ordena por maior risco primeiro
        resultado.sort(key=lambda x: x["probabilidade_ruptura"], reverse=True)
        return jsonify(resultado)

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ──────────────────────────────────────────────────────────
# UTILITÁRIOS
# ──────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":  "ok",
        "modelos": repo.listar_modelos(),
    })


@app.route("/charts/<filename>")
def serve_chart(filename):
    return send_from_directory(CHARTS_DIR, filename)


@app.route("/charts/list", methods=["GET"])
def list_charts():
    if not os.path.exists(CHARTS_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(CHARTS_DIR) if f.endswith(".png")])
    return jsonify(files)


@app.route("/eda/regenerar", methods=["POST"])
def regenerar_eda():
    try:
        gerar_todos()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/retreinar/<nome>", methods=["POST"])
def retreinar(nome: str):
    """Retreina um modelo específico. Chamar após acúmulo de novos dados."""
    import subprocess, sys
    try:
        resultado = subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "main.py"), "--modelo", nome],
            capture_output=True, text=True, timeout=300
        )
        # Recarrega o modelo na memória após retreino
        if nome in ["cancelamento", "inadimplencia", "estoque"]:
            try:
                model, scaler, features, encoders = repo.carregar(nome)
                modelos[nome] = {"model": model, "scaler": scaler,
                                 "features": features, "encoders": encoders}
            except Exception:
                pass

        return jsonify({
            "status": "ok" if resultado.returncode == 0 else "erro",
            "output": resultado.stdout[-2000:],  # últimas 2000 chars
            "errors": resultado.stderr[-1000:],
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Timeout — treino demorou mais de 5 minutos"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001, host="0.0.0.0")