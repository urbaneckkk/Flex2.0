/**
 * ml-widgets.js — FlexGestor
 * Componentes JavaScript reutilizáveis para exibir predições ML.
 * Inclua este arquivo no _Layout.cshtml para ter os widgets disponíveis em toda a app.
 *
 * Uso:
 *   FlexML.cancelamento(pedidoData, '#container-risco')
 *   FlexML.inadimplencia(clienteData, '#container-risco')
 *   FlexML.rupturaEstoque('#tabela-estoque')
 */

const FlexML = (() => {

    // ── Helpers ────────────────────────────────────────────
    const _post = (url, data) =>
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

    const _get = (url) =>
        fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);

    // Lida com diferenças de contrato (camelCase/snake_case) e evita NaN no front.
    const _num = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };

    const _pickProbRuptura = (item) =>
        _num(item?.probabilidadeRuptura ?? item?.probabilidade_ruptura, 0);

    const _pickDiasRestantes = (item) =>
        _num(item?.diasEstoqueRestante ?? item?.dias_estoque_restante, 0);

    // Renderiza o chip de risco (BAIXO / MEDIO / ALTO)
    const _chipHtml = (label, risco, cor, prob) => `
        <span class="ml-chip ml-chip--${risco.toLowerCase()}"
              style="--chip-color: ${cor}"
              title="Predição do modelo de IA | ${label}">
            <i class="ml-chip__dot"></i>
            <span class="ml-chip__label">${label}</span>
            <span class="ml-chip__badge">${risco}</span>
        </span>`;

    // Renderiza o estado de carregando
    const _loadingHtml = () => `
        <span class="ml-chip ml-chip--loading">
            <span class="ml-chip__spinner"></span>
            <span class="ml-chip__label">Analisando...</span>
        </span>`;

    // ── API 1: Risco de Cancelamento ───────────────────────
    /**
     * @param {Object} pedidoData - objeto com os campos do CancelamentoRequest
     * @param {string} selector   - seletor CSS do container onde o chip será inserido
     *
     * Exemplo de pedidoData (monte no Razor ou no JS que já tem os dados):
     * {
     *   canal: 'Shopee', valorTotal: 350, valorFrete: 15, desconto: 0,
     *   tipoClienteId: 1, generoCliente: 'M', saldoDevedor: 0,
     *   diasClienteCadastrado: 120, totalItens: 3, totalUnidades: 5,
     *   descontoMedioItem: 0, maiorValorUnitario: 150, mudancasStatus: 1,
     *   diasNoFunil: 0, formasPagamentoUsadas: 1, totalPago: 350,
     *   diaSemana: 3, mes: 5
     * }
     */
    const cancelamento = async (pedidoData, selector) => {
        const el = document.querySelector(selector);
        if (!el) return;

        el.innerHTML = _loadingHtml();

        const res = await _post('/ml/cancelamento', pedidoData);
        if (!res) { el.innerHTML = ''; return; }

        el.innerHTML = _chipHtml(res.label, res.risco, res.cor, res.probabilidade);
    };

    /**
     * Busca predição com base nas features agregadas no servidor (espelha data_loader).
     * GET /Pedido/PredicaoMlCancelamento?idPedido=
     */
    const cancelamentoPorPedido = async (idPedido, selector) => {
        const el = document.querySelector(selector);
        if (!el) return;

        el.innerHTML = _loadingHtml();

        const res = await fetch(`/Pedido/PredicaoMlCancelamento?idPedido=${encodeURIComponent(idPedido)}`)
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);

        if (!res || res.erro) {
            el.innerHTML = res?.erro
                ? `<span class="ml-chip ml-chip--muted" title="ML">${res.erro}</span>`
                : '';
            return;
        }

        el.innerHTML = _chipHtml(res.label, res.risco, res.cor, res.probabilidade);
    };

    // ── API 2: Risco de Inadimplência ──────────────────────
    /**
     * @param {Object} clienteData - campos do InadimplenciaRequest
     * @param {string} selector
     */
    const inadimplencia = async (clienteData, selector) => {
        const el = document.querySelector(selector);
        if (!el) return;

        el.innerHTML = _loadingHtml();

        const res = await _post('/ml/inadimplencia', clienteData);
        if (!res) { el.innerHTML = ''; return; }

        el.innerHTML = _chipHtml(res.label, res.risco, res.cor, res.probabilidade);
    };

    // ── API 3: Ruptura de Estoque (batch) ──────────────────
    /**
     * Busca os riscos de ruptura e injeta chips na tabela de estoque.
     * Espera que cada linha da tabela tenha data-produto-id="N".
     *
     * @param {string} tabelaSelector - seletor da tabela AG Grid ou table HTML
     * @param {string} colunaSelector - seletor do elemento onde injetar o chip em cada linha
     */
    const rupturaEstoque = async (tabelaSelector, colunaSelector = '.ml-risco-estoque') => {
        const res = await _get('/ml/ruptura-estoque');
        if (!res || !res.length) return;

        // Monta mapa idProduto → resultado
        const mapa = {};
        res.forEach(item => { mapa[item.idProduto] = item; });

        // Injeta chips nas linhas da tabela
        document.querySelectorAll(`${tabelaSelector} [data-produto-id]`).forEach(row => {
            const id = parseInt(row.dataset.produtoId);
            const item = mapa[id];
            if (!item) return;
            const prob = _pickProbRuptura(item);
            const diasRestantes = _pickDiasRestantes(item);

            const col = row.querySelector(colunaSelector);
            if (!col) return;

            col.innerHTML = _chipHtml(
                `${Math.round(prob * 100)}% risco`,
                item.risco,
                item.cor,
                prob
            );

            // Badge extra: dias restantes
            if (diasRestantes < 15) {
                col.innerHTML += `
                    <span class="ml-chip ml-chip--warning" title="Dias de estoque restantes">
                        <i class="bi bi-clock"></i> ~${Math.round(diasRestantes)}d
                    </span>`;
            }
        });
    };

    // ── Inicializador do Dashboard ──────────────────────────
    /**
     * Carrega um resumo de alertas ML para o widget do dashboard.
     * Exibe os N produtos com maior risco de ruptura.
     *
     * @param {string} selector - seletor do container do widget
     * @param {number} top      - quantos produtos exibir (default 5)
     */
    const dashboardAlertas = async (selector, top = 5) => {
        const el = document.querySelector(selector);
        if (!el) return;

        el.innerHTML = '<div class="ml-loading">Carregando análise de estoque...</div>';

        const res = await _get('/ml/ruptura-estoque');
        if (!res || !res.length) {
            el.innerHTML = '<p class="ml-vazio">Nenhum alerta de estoque.</p>';
            return;
        }

        const altos = res.filter(r => r.risco === 'ALTO').length;
        const medios = res.filter(r => r.risco === 'MEDIO').length;
        const top5 = res.slice(0, top);

        el.innerHTML = `
            <div class="ml-dashboard-header">
                <span class="ml-kpi ml-kpi--alto">${altos} críticos</span>
                <span class="ml-kpi ml-kpi--medio">${medios} atenção</span>
            </div>
            <ul class="ml-lista-ruptura">
                ${top5.map(item => `
                    <li class="ml-lista-ruptura__item">
                        <span class="ml-lista-ruptura__id">Prod. #${item.idProduto}</span>
                        <div class="ml-lista-ruptura__barra">
                            <div class="ml-lista-ruptura__fill"
                                 style="width:${Math.round(_pickProbRuptura(item) * 100)}%;
                                        background:${item.cor}">
                            </div>
                        </div>
                        <span class="ml-lista-ruptura__prob"
                              style="color:${item.cor}">
                            ${Math.round(_pickProbRuptura(item) * 100)}%
                        </span>
                        <span class="ml-lista-ruptura__dias">~${Math.round(_pickDiasRestantes(item))}d</span>
                    </li>
                `).join('')}
            </ul>
            ${res.length > top ? `<a href="/Estoque" class="ml-ver-todos">Ver todos (${res.length})</a>` : ''}
        `;
    };

    // ── Exposição pública ───────────────────────────────────
    return { cancelamento, cancelamentoPorPedido, inadimplencia, rupturaEstoque, dashboardAlertas };

})();