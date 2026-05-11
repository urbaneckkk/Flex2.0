// ===== CAIXA.JS — FlexGestor (completo) =====

const ITENS_POR_PAGINA = 15;
let paginaAtual = 1;
let abaAtiva = "lancamentos";
let caixaAtual = null;
let lancamentos = [];
let historicoList = [];
let formasPagamento = [];
let categorias = [];
let contasReceber = [];
let clientesCache = [];
let produtosCache = [];
let categoriasProdutoCache = [];
let tipoLancamentoAtual = "VENDA";
let _categoriaSelecionada = null;
let _vendaRapidaItens = [];
let _clienteSelecionadoVenda = null;
let _vrProdutoIdx = null;
let _contaReceberAtual = null;

// ── Helpers ──────────────────────────────
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `POST ${url} → ${res.status}`);
    }
    return res.json().catch(() => null);
}

function fmtMoeda(v) {
    return `R$ ${Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function fmtDataHora(s) {
    if (!s) return "—";
    const local = s.endsWith("Z") ? s.slice(0, -1) : s;
    return new Date(local).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function fmtData(s) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("pt-BR");
}

function flexToast(msg, tipo = "sucesso") {
    const cores = { sucesso: "#15803d", erro: "#dc2626", aviso: "#d97706" };
    const icones = { sucesso: "bi-check-circle-fill", erro: "bi-x-circle-fill", aviso: "bi-exclamation-triangle-fill" };
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;max-width:36rem;`;
    t.innerHTML = `<i class="bi ${icones[tipo]}"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
    setTimeout(() => {
        t.style.opacity = "0"; t.style.transform = "translateY(-1rem)";
        setTimeout(() => t.remove(), 350);
    }, 3200);
}

function isEntrada(l) { return Number(l.tipoCategoria) === 1; }
function calcularEntradas() { return lancamentos.filter(l => isEntrada(l)).reduce((a, l) => a + Number(l.valor), 0); }
function calcularSaidas() { return lancamentos.filter(l => !isEntrada(l)).reduce((a, l) => a + Number(l.valor), 0); }
function calcularSaldo() {
    if (!caixaAtual) return 0;
    return Number(caixaAtual.saldoInicial) + calcularEntradas() - calcularSaidas();
}

// ── Inicializar ───────────────────────────
async function inicializar() {
    try {
        const statusData = await apiGet("/Caixa/Status");
        caixaAtual = statusData.caixa;

        const promises = [
            apiGet("/Caixa/Historico"),
            apiGet("/Caixa/FormasPagamento"),
            apiGet("/Caixa/Categorias"),
            apiGet("/Caixa/ContasReceber").catch(() => []),
            apiGet("/Cliente/Listar").catch(() => []),
            apiGet("/Produto/Listar").catch(() => [])
        ];

        if (caixaAtual) {
            promises.push(apiGet("/Caixa/Lancamentos").catch(() => []));
            promises.push(apiGet("/Caixa/Breakdown").catch(() => []));
        }

        const results = await Promise.all(promises);
        historicoList = results[0];
        formasPagamento = results[1];
        categorias = results[2];
        contasReceber = results[3];
        clientesCache = results[4];
        produtosCache = results[5];
        lancamentos = caixaAtual ? (results[6] || []) : [];

        atualizarPainel();

        if (caixaAtual && results[7]?.length) {
            renderizarBreakdownData(results[7]);
        } else {
            atualizarBreakdown();
        }

        renderizarLancamentos();
        renderizarContas();
        renderizarHistorico();

    } catch (err) {
        console.error("Erro ao inicializar:", err);
        flexToast("Erro ao carregar dados do caixa.", "erro");
    }
}

// ── Painel superior ───────────────────────
function atualizarPainel() {
    const aberto = !!caixaAtual;

    // Status badge
    const badge = document.getElementById("caixa-status-badge");
    if (badge) {
        badge.className = `caixa-status-badge ${aberto ? "aberto" : "fechado"}`;
        badge.innerHTML = aberto
            ? '<i class="bi bi-unlock-fill"></i> Aberto'
            : '<i class="bi bi-lock-fill"></i> Fechado';
    }

    // Operador e abertura
    document.getElementById("caixa-operador").textContent = caixaAtual?.nomeOperador || "—";
    document.getElementById("caixa-abertura").textContent = caixaAtual
        ? `Aberto em ${fmtDataHora(caixaAtual.dthAbertura)}`
        : "—";

    // Saldo
    const saldo = calcularSaldo();
    const entradas = calcularEntradas();
    const saidas = calcularSaidas();
    const liquido = entradas - saidas;

    document.getElementById("caixa-saldo-atual").textContent = fmtMoeda(saldo);
    document.getElementById("caixa-saldo-inicial").textContent = fmtMoeda(caixaAtual?.saldoInicial || 0);
    document.getElementById("caixa-entradas").textContent = fmtMoeda(entradas);
    document.getElementById("caixa-saidas").textContent = fmtMoeda(saidas);
    const liquidoEl = document.getElementById("caixa-liquido");
    if (liquidoEl) {
        liquidoEl.textContent = fmtMoeda(liquido);
        liquidoEl.className = `resumo-valor ${liquido >= 0 ? "verde" : "vermelho"}`;
    }
    document.getElementById("caixa-troco").textContent = fmtMoeda(caixaAtual?.troco || 0);

    // Botões abrir/fechar
    document.getElementById("btn-abrir").style.display = aberto ? "none" : "";
    document.getElementById("btn-fechar").style.display = aberto ? "" : "none";

    // Botões de ação (habilitam só com caixa aberto)
    document.querySelectorAll(".btn-acao-caixa").forEach(b => b.disabled = !aberto);

    // Preenche modal de fechamento
    document.getElementById("fechar-saldo-inicial-label").textContent = fmtMoeda(caixaAtual?.saldoInicial || 0);
    document.getElementById("fechar-entradas-label").textContent = fmtMoeda(entradas);
    document.getElementById("fechar-saidas-label").textContent = fmtMoeda(saidas);
    const saldoFinal = (caixaAtual?.saldoInicial || 0) + entradas - saidas;
    document.getElementById("fechar-saldo-calculado-label").textContent = fmtMoeda(saldoFinal);
    document.getElementById("fechar-saldo-calculado").value = saldoFinal;
}

function atualizarBreakdown() {
    const container = document.getElementById("breakdown-lista");
    if (!container) return;

    if (!caixaAtual) {
        container.innerHTML = `<div class="breakdown-empty">Abra o caixa para ver o detalhamento.</div>`;
        return;
    }

    // Agrupa lançamentos por forma de pagamento
    const grupos = {};
    lancamentos.forEach(l => {
        const fp = l.formaPagamento || "Outros";
        if (!grupos[fp]) grupos[fp] = { entrada: 0, saida: 0 };
        if (isEntrada(l)) grupos[fp].entrada += Number(l.valor);
        else grupos[fp].saida += Number(l.valor);
    });

    if (!Object.keys(grupos).length) {
        container.innerHTML = `<div class="breakdown-empty">Nenhum lançamento ainda.</div>`;
        return;
    }

    container.innerHTML = Object.entries(grupos).map(([fp, v]) => {
        const liquido = v.entrada - v.saida;
        return `
        <div class="breakdown-item">
            <div class="breakdown-nome">${fp}</div>
            <div class="breakdown-valores">
                <span class="breakdown-entrada">+${fmtMoeda(v.entrada)}</span>
                <span class="breakdown-saida">−${fmtMoeda(v.saida)}</span>
                <span class="breakdown-liquido ${liquido >= 0 ? 'verde' : 'vermelho'}">${fmtMoeda(liquido)}</span>
            </div>
        </div>`;
    }).join("");
}

function renderizarBreakdownData(data) {
    const container = document.getElementById("breakdown-lista");
    if (!container || !data?.length) { atualizarBreakdown(); return; }

    container.innerHTML = data.map(b => `
        <div class="breakdown-item">
            <div class="breakdown-nome">${b.formaPagamento || b.nome || "Outros"}</div>
            <div class="breakdown-valores">
                <span class="breakdown-entrada">+${fmtMoeda(b.entradas)}</span>
                <span class="breakdown-saida">−${fmtMoeda(b.saidas)}</span>
                <span class="breakdown-liquido ${(b.liquido ?? b.entradas - b.saidas) >= 0 ? 'verde' : 'vermelho'}">${fmtMoeda(b.liquido ?? b.entradas - b.saidas)}</span>
            </div>
        </div>`).join("");
}

// ── Abas ─────────────────────────────────
// ── Abas ─────────────────────────────────────────────────────────────────
function mudarAba(aba) {
    document.querySelectorAll(".fin-aba-btn").forEach(b => b.classList.remove("ativa"));
    document.getElementById(`aba-btn-${aba}`)?.classList.add("ativa");
    document.getElementById("painel-receber").style.display = aba === "receber" ? "" : "none";
    document.getElementById("painel-pagar").style.display = aba === "pagar" ? "" : "none";
}

// ── Filtros ───────────────────────────────────────────────────────────────
function setFiltroReceber(valor) {
    filtroReceber = valor;
    document.querySelectorAll("[id^='fr-']").forEach(b =>
        b.classList.remove("sel-todos", "sel-aberto", "sel-vencido", "sel-pago"));
    document.getElementById(`fr-${valor}`)?.classList.add(`sel-${valor}`);
    pagReceberAtual = 1;
    aplicarFiltroReceber();
}

function setFiltroPagar(valor) {
    filtroPagar = valor;
    document.querySelectorAll("[id^='fp-']").forEach(b =>
        b.classList.remove("sel-todos", "sel-aberto", "sel-vencido", "sel-pago"));
    document.getElementById(`fp-${valor}`)?.classList.add(`sel-${valor}`);
    pagPagarAtual = 1;
    aplicarFiltroPagar();
}

function aplicarFiltroReceber() {
    const termo = filtroReceberTexto.toLowerCase();
    contasReceberFiltradas = contasReceber.filter(c => {
        if (filtroReceber !== "todos" && (c.statusAtual ?? "ABERTO").toUpperCase() !== filtroReceber.toUpperCase()) return false;
        if (termo && !(c.nomeCliente ?? "").toLowerCase().includes(termo) && !(c.descricao ?? "").toLowerCase().includes(termo)) return false;
        if (filtroVencimentoInicioR && new Date(c.dthVencimento) < new Date(filtroVencimentoInicioR)) return false;
        if (filtroVencimentoFimR && new Date(c.dthVencimento) > new Date(filtroVencimentoFimR + "T23:59:59")) return false;
        return true;
    });
    contasReceberFiltradas = ordenar(contasReceberFiltradas, ordemReceber);
    renderizarTabelaReceber();
}

function aplicarFiltroPagar() {
    const termo = filtroPagarTexto.toLowerCase();
    contasPagarFiltradas = contasPagar.filter(c => {
        if (filtroPagar !== "todos" && (c.statusAtual ?? "ABERTO").toUpperCase() !== filtroPagar.toUpperCase()) return false;
        if (termo && !(c.nomeFornecedor ?? "").toLowerCase().includes(termo) && !(c.descricao ?? "").toLowerCase().includes(termo)) return false;
        if (filtroVencimentoInicioP && new Date(c.dthVencimento) < new Date(filtroVencimentoInicioP)) return false;
        if (filtroVencimentoFimP && new Date(c.dthVencimento) > new Date(filtroVencimentoFimP + "T23:59:59")) return false;
        return true;
    });
    contasPagarFiltradas = ordenar(contasPagarFiltradas, ordemPagar);
    renderizarTabelaPagar();
}

function filtrarReceber() {
    filtroReceberTexto = document.getElementById("fr-busca")?.value ?? "";
    filtroVencimentoInicioR = document.getElementById("fr-venc-inicio")?.value ?? null;
    filtroVencimentoFimR = document.getElementById("fr-venc-fim")?.value ?? null;
    pagReceberAtual = 1;
    aplicarFiltroReceber();
}

function filtrarPagar() {
    filtroPagarTexto = document.getElementById("fp-busca")?.value ?? "";
    filtroVencimentoInicioP = document.getElementById("fp-venc-inicio")?.value ?? null;
    filtroVencimentoFimP = document.getElementById("fp-venc-fim")?.value ?? null;
    pagPagarAtual = 1;
    aplicarFiltroPagar();
}

// ── Renderizar tabelas ────────────────────────────────────────────────────
function renderizarTabelaReceber() {
    const tbody = document.getElementById("tbody-receber");
    if (!tbody) return;
    const total = contasReceberFiltradas.length;
    const inicio = (pagReceberAtual - 1) * PAG_RECEBER;
    const pagina = contasReceberFiltradas.slice(inicio, inicio + PAG_RECEBER);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhuma conta encontrada.</td></tr>`;
        renderizarPaginacao("receber", 0);
        return;
    }

    tbody.innerHTML = pagina.map(c => {
        const restante = Math.max(0, c.valorTotal - c.valorPago);
        const status = c.statusAtual ?? "ABERTO";
        return `<tr>
            <td class="area-acoes">
                ${status !== "PAGO" ? `
                <button class="btn-acao btn-pagar-icon" title="Receber" onclick="abrirModalReceberPagamento(${c.idContaReceber})">
                    <i class="bi bi-currency-dollar"></i>
                </button>` : ""}
                <button class="btn-acao btn-calendar-icon" title="Editar" onclick="abrirModalEditarReceber(${c.idContaReceber})">
                    <i class="bi bi-pencil-fill"></i>
                </button>
                <button class="btn-acao" title="Alterar vencimento" onclick="abrirModalVencReceber(${c.idContaReceber})">
                    <i class="bi bi-calendar-event"></i>
                </button>
                <button class="btn-acao" title="Histórico" onclick="abrirHistorico('receber', ${c.idContaReceber})">
                    <i class="bi bi-clock-history"></i>
                </button>
                <button class="btn-acao btn-inativar" title="Excluir" onclick="abrirModalExcluirReceber(${c.idContaReceber})">
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </td>
            <td><span class="status-pill ${getPillClass(status)}">${getPillLabel(status)}</span></td>
            <td>${c.nomeCliente ?? "—"}</td>
            <td>${c.descricao ?? "—"}</td>
            <td>${fmtData(c.dthVencimento)}</td>
            <td>${fmt(c.valorTotal)}</td>
            <td>${fmt(c.valorPago)}</td>
            <td class="${restante > 0 ? 'valor-negativo' : ''}">${fmt(restante)}</td>
        </tr>`;
    }).join("");

    renderizarPaginacao("receber", total);
    atualizarBadgeAba("receber");
}

function renderizarTabelaPagar() {
    const tbody = document.getElementById("tbody-pagar");
    if (!tbody) return;
    const total = contasPagarFiltradas.length;
    const inicio = (pagPagarAtual - 1) * PAG_PAGAR;
    const pagina = contasPagarFiltradas.slice(inicio, inicio + PAG_PAGAR);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhuma conta encontrada.</td></tr>`;
        renderizarPaginacao("pagar", 0);
        return;
    }

    tbody.innerHTML = pagina.map(c => {
        const restante = Math.max(0, c.valorTotal - c.valorPago);
        const status = c.statusAtual ?? "ABERTO";
        return `<tr>
            <td class="area-acoes">
                ${status !== "PAGO" ? `
                <button class="btn-acao btn-pagar-icon" title="Pagar" onclick="abrirModalPagarConta(${c.idContaPagar})">
                    <i class="bi bi-currency-dollar"></i>
                </button>` : ""}
                <button class="btn-acao btn-calendar-icon" title="Editar" onclick="abrirModalEditarPagar(${c.idContaPagar})">
                    <i class="bi bi-pencil-fill"></i>
                </button>
                <button class="btn-acao" title="Alterar vencimento" onclick="abrirModalVencPagar(${c.idContaPagar})">
                    <i class="bi bi-calendar-event"></i>
                </button>
                <button class="btn-acao" title="Histórico" onclick="abrirHistorico('pagar', ${c.idContaPagar})">
                    <i class="bi bi-clock-history"></i>
                </button>
                <button class="btn-acao btn-inativar" title="Excluir" onclick="abrirModalExcluirPagar(${c.idContaPagar})">
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </td>
            <td><span class="status-pill ${getPillClass(status)}">${getPillLabel(status)}</span></td>
            <td>${c.nomeFornecedor ?? "—"}</td>
            <td>${c.descricao ?? "—"}</td>
            <td>${fmtData(c.dthVencimento)}</td>
            <td>${fmt(c.valorTotal)}</td>
            <td>${fmt(c.valorPago)}</td>
            <td class="${restante > 0 ? 'valor-negativo' : ''}">${fmt(restante)}</td>
        </tr>`;
    }).join("");

    renderizarPaginacao("pagar", total);
    atualizarBadgeAba("pagar");
}

function atualizarBadgeAba(aba) {
    const lista = aba === "receber" ? contasReceber : contasPagar;
    const vencidas = lista.filter(c => c.statusAtual === "VENCIDO").length;
    const badge = document.getElementById(`badge-${aba}`);
    if (!badge) return;
    badge.textContent = vencidas;
    badge.classList.toggle("visivel", vencidas > 0);
}

function renderizarPaginacao(tipo, total) {
    const PAG = tipo === "receber" ? PAG_RECEBER : PAG_PAGAR;
    const pag = tipo === "receber" ? pagReceberAtual : pagPagarAtual;
    const totalPags = Math.ceil(total / PAG);
    const ini = total === 0 ? 0 : (pag - 1) * PAG + 1;
    const fim = Math.min(pag * PAG, total);

    document.getElementById(`pag-info-${tipo}`)?.setAttribute("data-text",
        total === 0 ? "Nenhum registro" : `Mostrando ${ini}–${fim} de ${total}`);

    const infoEl = document.getElementById(`pag-info-${tipo}`);
    if (infoEl) infoEl.textContent = total === 0 ? "Nenhum registro" : `Mostrando ${ini}–${fim} de ${total}`;

    const ctrl = document.getElementById(`pag-ctrl-${tipo}`);
    if (!ctrl) return;
    ctrl.innerHTML = "";

    const prev = document.createElement("button");
    prev.className = "btn-pagina"; prev.textContent = "‹"; prev.disabled = pag === 1;
    prev.onclick = () => { if (tipo === "receber") pagReceberAtual--; else pagPagarAtual--; aplicarFiltro(tipo); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPags; i++) {
        const btn = document.createElement("button");
        btn.className = `btn-pagina${i === pag ? " ativo" : ""}`;
        btn.textContent = i;
        btn.onclick = () => { if (tipo === "receber") pagReceberAtual = i; else pagPagarAtual = i; aplicarFiltro(tipo); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement("button");
    next.className = "btn-pagina"; next.textContent = "›"; next.disabled = pag >= totalPags;
    next.onclick = () => { if (tipo === "receber") pagReceberAtual++; else pagPagarAtual++; aplicarFiltro(tipo); };
    ctrl.appendChild(next);
}

function aplicarFiltro(tipo) {
    tipo === "receber" ? aplicarFiltroReceber() : aplicarFiltroPagar();
}

// ── Helpers de modal ──────────────────────────────────────────────────────
function abrirModal(id) { document.getElementById(id)?.classList.add("open"); }
function fecharModal(id) { document.getElementById(id)?.classList.remove("open"); }

function popularSelectFP(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = formasPagamento.map(f =>
        `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");
}

function popularSelectCat(id, tipo) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const filtradas = tipo ? categorias.filter(c => c.Tipo === tipo || c.tipo === tipo) : categorias;
    sel.innerHTML = filtradas.map(c =>
        `<option value="${c.idCategoriaFinanceira}">${c.nome}</option>`).join("");
}

function popularSelectClientes(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Selecione...</option>` +
        clientes.map(c => `<option value="${c.idCliente}">${c.nome}</option>`).join("");
}

function popularSelectFornecedores(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Selecione...</option>` +
        fornecedores.map(f => `<option value="${f.idFornecedor}">${f.nomeFantasia}</option>`).join("");
}

function popularSelects() {
    popularSelectFP("nova-receber-fp");
    popularSelectCat("nova-receber-cat", 1);
    popularSelectClientes("nova-receber-cliente");
    popularSelectFP("receber-pag-fp");
    popularSelectCat("receber-pag-cat", 1);
}

function popularSelectsEdicao() {
    popularSelectFP("nova-pagar-fp");
    popularSelectCat("nova-pagar-cat", 2);
    popularSelectFornecedores("nova-pagar-fornecedor");
    popularSelectFP("pagar-conta-fp");
    popularSelectCat("pagar-conta-cat", 2);
}

// ── Modal: Nova Conta a Receber ───────────────────────────────────────────
function abrirModalNovaReceber() {
    document.getElementById("nova-receber-form")?.reset();
    abrirModal("modal-nova-receber");
}
function fecharModalNovaReceber() { fecharModal("modal-nova-receber"); }

async function salvarNovaReceber() {
    const clienteId = parseInt(document.getElementById("nova-receber-cliente")?.value);
    const valorTotal = parseFloat(document.getElementById("nova-receber-valor")?.value);
    const dthVencimento = document.getElementById("nova-receber-venc")?.value;
    const descricao = document.getElementById("nova-receber-desc")?.value || null;
    if (!clienteId || !valorTotal || !dthVencimento) { flexToast("Preencha todos os campos obrigatórios.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/CriarContaReceber", { ClienteId: clienteId, ValorTotal: valorTotal, DthVencimento: dthVencimento, Descricao: descricao });
        fecharModalNovaReceber();
        flexToast("Conta a receber criada!", "sucesso");
        await recarregarReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Receber Pagamento ──────────────────────────────────────────────
let _contaReceberAtual = null;
function abrirModalReceberPagamento(id) {
    _contaReceberAtual = contasReceber.find(c => c.idContaReceber === id);
    if (!_contaReceberAtual) return;
    document.getElementById("receber-pag-cliente").textContent = _contaReceberAtual.nomeCliente ?? "—";
    document.getElementById("receber-pag-restante").textContent = fmt(Math.max(0, _contaReceberAtual.valorTotal - _contaReceberAtual.valorPago));
    document.getElementById("receber-pag-valor").value = "";
    abrirModal("modal-receber-pagamento");
}
function fecharModalReceberPagamento() { fecharModal("modal-receber-pagamento"); }

async function confirmarReceberPagamento() {
    if (!_contaReceberAtual) return;
    const valorPago = parseFloat(document.getElementById("receber-pag-valor")?.value);
    const idFP = parseInt(document.getElementById("receber-pag-fp")?.value);
    const idCat = parseInt(document.getElementById("receber-pag-cat")?.value);
    if (!valorPago || valorPago <= 0) { flexToast("Informe o valor recebido.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/ReceberConta", { IdContaReceber: _contaReceberAtual.idContaReceber, ValorPago: valorPago, IdFormaPagamento: idFP, IdCategoriaFinanceira: idCat });
        fecharModalReceberPagamento();
        flexToast("Pagamento registrado!", "sucesso");
        await recarregarReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Editar Conta a Receber ─────────────────────────────────────────
function abrirModalEditarReceber(id) {
    const c = contasReceber.find(x => x.idContaReceber === id);
    if (!c) return;
    document.getElementById("editar-receber-id").value = id;
    document.getElementById("editar-receber-desc").value = c.descricao ?? "";
    document.getElementById("editar-receber-valor").value = c.valorTotal;
    document.getElementById("editar-receber-venc").value = c.dthVencimento?.substring(0, 10) ?? "";
    document.getElementById("editar-receber-cliente").value = c.cliente_id ?? "";
    abrirModal("modal-editar-receber");
}
function fecharModalEditarReceber() { fecharModal("modal-editar-receber"); }

async function salvarEditarReceber() {
    const id = parseInt(document.getElementById("editar-receber-id")?.value);
    try {
        await apiPost("/Financeiro/EditarContaReceber", {
            IdContaReceber: id,
            Descricao: document.getElementById("editar-receber-desc")?.value || null,
            ValorTotal: parseFloat(document.getElementById("editar-receber-valor")?.value),
            DthVencimento: document.getElementById("editar-receber-venc")?.value,
            ClienteId: parseInt(document.getElementById("editar-receber-cliente")?.value)
        });
        fecharModalEditarReceber();
        flexToast("Conta atualizada!", "sucesso");
        await recarregarReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Alterar Vencimento Receber ─────────────────────────────────────
let _vencReceberAtual = null;
function abrirModalVencReceber(id) {
    _vencReceberAtual = id;
    const c = contasReceber.find(x => x.idContaReceber === id);
    if (c) document.getElementById("venc-receber-data").value = c.dthVencimento?.substring(0, 10) ?? "";
    abrirModal("modal-venc-receber");
}
function fecharModalVencReceber() { fecharModal("modal-venc-receber"); }

async function salvarVencReceber() {
    const data = document.getElementById("venc-receber-data")?.value;
    if (!data) { flexToast("Informe a data.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/AlterarVencimentoReceber", { IdContaReceber: _vencReceberAtual, NovaData: data });
        fecharModalVencReceber();
        flexToast("Vencimento atualizado!", "sucesso");
        await recarregarReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Excluir Receber ────────────────────────────────────────────────
let _excluirReceberAtual = null;
function abrirModalExcluirReceber(id) {
    _excluirReceberAtual = id;
    abrirModal("modal-excluir-receber");
}
function fecharModalExcluirReceber() { fecharModal("modal-excluir-receber"); }

async function confirmarExcluirReceber() {
    try {
        await apiPost("/Financeiro/ExcluirContaReceber", { Id: _excluirReceberAtual });
        fecharModalExcluirReceber();
        flexToast("Conta excluída!", "sucesso");
        await recarregarReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Nova Conta a Pagar ─────────────────────────────────────────────
function abrirModalNovaPagar() {
    document.getElementById("nova-pagar-form")?.reset();
    abrirModal("modal-nova-pagar");
}
function fecharModalNovaPagar() { fecharModal("modal-nova-pagar"); }

async function salvarNovaPagar() {
    const valorTotal = parseFloat(document.getElementById("nova-pagar-valor")?.value);
    const dthVencimento = document.getElementById("nova-pagar-venc")?.value;
    const descricao = document.getElementById("nova-pagar-desc")?.value || null;
    const fornecedorId = parseInt(document.getElementById("nova-pagar-fornecedor")?.value) || null;
    if (!valorTotal || !dthVencimento) { flexToast("Preencha todos os campos obrigatórios.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/CriarContaPagar", { FornecedorId: fornecedorId, ValorTotal: valorTotal, DthVencimento: dthVencimento, Descricao: descricao });
        fecharModalNovaPagar();
        flexToast("Conta a pagar criada!", "sucesso");
        await recarregarPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Pagar Conta ────────────────────────────────────────────────────
let _contaPagarAtual = null;
function abrirModalPagarConta(id) {
    _contaPagarAtual = contasPagar.find(c => c.idContaPagar === id);
    if (!_contaPagarAtual) return;
    document.getElementById("pagar-conta-fornecedor").textContent = _contaPagarAtual.nomeFornecedor ?? "—";
    document.getElementById("pagar-conta-restante").textContent = fmt(Math.max(0, _contaPagarAtual.valorTotal - _contaPagarAtual.valorPago));
    document.getElementById("pagar-conta-valor").value = "";
    abrirModal("modal-pagar-conta");
}
function fecharModalPagarConta() { fecharModal("modal-pagar-conta"); }

async function confirmarPagarConta() {
    if (!_contaPagarAtual) return;
    const valorPago = parseFloat(document.getElementById("pagar-conta-valor")?.value);
    const idFP = parseInt(document.getElementById("pagar-conta-fp")?.value);
    const idCat = parseInt(document.getElementById("pagar-conta-cat")?.value);
    if (!valorPago || valorPago <= 0) { flexToast("Informe o valor pago.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/PagarConta", { IdContaPagar: _contaPagarAtual.idContaPagar, ValorPago: valorPago, IdFormaPagamento: idFP, IdCategoriaFinanceira: idCat });
        fecharModalPagarConta();
        flexToast("Pagamento registrado!", "sucesso");
        await recarregarPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Editar Conta a Pagar ───────────────────────────────────────────
function abrirModalEditarPagar(id) {
    const c = contasPagar.find(x => x.idContaPagar === id);
    if (!c) return;
    document.getElementById("editar-pagar-id").value = id;
    document.getElementById("editar-pagar-desc").value = c.descricao ?? "";
    document.getElementById("editar-pagar-valor").value = c.valorTotal;
    document.getElementById("editar-pagar-venc").value = c.dthVencimento?.substring(0, 10) ?? "";
    document.getElementById("editar-pagar-fornecedor").value = c.fornecedor_id ?? "";
    abrirModal("modal-editar-pagar");
}
function fecharModalEditarPagar() { fecharModal("modal-editar-pagar"); }

async function salvarEditarPagar() {
    const id = parseInt(document.getElementById("editar-pagar-id")?.value);
    try {
        await apiPost("/Financeiro/EditarContaPagar", {
            IdContaPagar: id,
            Descricao: document.getElementById("editar-pagar-desc")?.value || null,
            ValorTotal: parseFloat(document.getElementById("editar-pagar-valor")?.value),
            DthVencimento: document.getElementById("editar-pagar-venc")?.value,
            FornecedorId: parseInt(document.getElementById("editar-pagar-fornecedor")?.value) || null
        });
        fecharModalEditarPagar();
        flexToast("Conta atualizada!", "sucesso");
        await recarregarPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Alterar Vencimento Pagar ──────────────────────────────────────
let _vencPagarAtual = null;
function abrirModalVencPagar(id) {
    _vencPagarAtual = id;
    const c = contasPagar.find(x => x.idContaPagar === id);
    if (c) document.getElementById("venc-pagar-data").value = c.dthVencimento?.substring(0, 10) ?? "";
    abrirModal("modal-venc-pagar");
}
function fecharModalVencPagar() { fecharModal("modal-venc-pagar"); }

async function salvarVencPagar() {
    const data = document.getElementById("venc-pagar-data")?.value;
    if (!data) { flexToast("Informe a data.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/AlterarVencimentoPagar", { IdContaPagar: _vencPagarAtual, NovaData: data });
        fecharModalVencPagar();
        flexToast("Vencimento atualizado!", "sucesso");
        await recarregarPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Excluir Pagar ──────────────────────────────────────────────────
let _excluirPagarAtual = null;
function abrirModalExcluirPagar(id) {
    _excluirPagarAtual = id;
    abrirModal("modal-excluir-pagar");
}
function fecharModalExcluirPagar() { fecharModal("modal-excluir-pagar"); }

async function confirmarExcluirPagar() {
    try {
        await apiPost("/Financeiro/ExcluirContaPagar", { Id: _excluirPagarAtual });
        fecharModalExcluirPagar();
        flexToast("Conta excluída!", "sucesso");
        await recarregarPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Modal: Histórico ──────────────────────────────────────────────────────
async function abrirHistorico(tipo, id) {
    const url = tipo === "receber"
        ? `/Financeiro/HistoricoReceber?idContaReceber=${id}`
        : `/Financeiro/HistoricoPagar?idContaPagar=${id}`;
    try {
        const lista = await apiGet(url);
        const tbody = document.getElementById("tbody-historico");
        if (tbody) {
            tbody.innerHTML = lista.length
                ? lista.map(h => `<tr>
                    <td>${fmtData(h.dthPagamento)}</td>
                    <td>${fmt(h.valorPago)}</td>
                    <td>${h.observacao ?? "—"}</td>
                  </tr>`).join("")
                : `<tr><td colspan="3" class="empty-state">Nenhum registro.</td></tr>`;
        }
        abrirModal("modal-historico");
    } catch (err) { flexToast(err.message, "erro"); }
}
function fecharHistorico() { fecharModal("modal-historico"); }

// ── Exportar ──────────────────────────────────────────────────────────────
function exportar(tipo, formato) {
    const url = formato === "excel"
        ? `/Financeiro/ExportarExcel?tipo=${tipo}`
        : `/Financeiro/ExportarPdf?tipo=${tipo}`;
    window.open(url, "_blank");
}

// ── Recarregar ────────────────────────────────────────────────────────────
async function recarregarReceber() {
    contasReceber = await apiGet("/Financeiro/ListarContasReceber").catch(() => []);
    atualizarKPIs();
    aplicarFiltroReceber();
}

async function recarregarPagar() {
    contasPagar = await apiGet("/Financeiro/ListarContasPagar").catch(() => []);
    atualizarKPIs();
    aplicarFiltroPagar();
}

// ── Renderizar lançamentos ────────────────
function renderizarLancamentos() {
    const tbody = document.querySelector("#tabela-lancamentos tbody");
    if (!tbody) return;

    if (!lancamentos.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum lançamento neste caixa.</td></tr>`;
        return;
    }

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const pagina = lancamentos.slice(inicio, inicio + ITENS_POR_PAGINA);

    const TIPO_CONFIG = {
        VENDA: { classe: "tipo-venda", label: "Venda" },
        DESPESA: { classe: "tipo-despesa", label: "Despesa" },
        SANGRIA: { classe: "tipo-sangria", label: "Sangria" },
        SUPRIMENTO: { classe: "tipo-suprimento", label: "Suprimento" },
        RECEBIMENTO: { classe: "tipo-recebimento", label: "Recebimento" },
    };

    tbody.innerHTML = pagina.map(l => {
        const cfg = TIPO_CONFIG[(l.tipo || "").toUpperCase()] || { classe: "tipo-manual", label: l.tipo || "—" };
        const entrada = isEntrada(l);
        return `
        <tr>
            <td>${fmtDataHora(l.dthLancamento)}</td>
            <td><span class="tipo-pill ${cfg.classe}">${cfg.label}</span></td>
            <td>${l.nomeCategoria || "—"}</td>
            <td>${l.formaPagamento || "—"}</td>
            <td>${l.nomeCliente || "—"}</td>
            <td>${l.descricao || "—"}</td>
            <td class="${entrada ? "valor-entrada" : "valor-saida"}">${entrada ? "+" : "−"}${fmtMoeda(l.valor)}</td>
        </tr>`;
    }).join("");
}

// ── Renderizar contas a receber ───────────
function renderizarContas() {
    const tbody = document.querySelector("#tabela-contas tbody");
    if (!tbody) return;

    const abertas = contasReceber.filter(c => c.statusAtual !== "PAGO");
    const vencidas = abertas.filter(c => c.statusAtual === "VENCIDO").length;

    const badge = document.getElementById("badge-contas-vencidas");
    if (badge) {
        badge.textContent = vencidas;
        badge.style.display = vencidas > 0 ? "" : "none";
    }

    if (!abertas.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhuma conta a receber em aberto.</td></tr>`;
        return;
    }

    tbody.innerHTML = abertas.map(c => {
        const restante = Math.max(0, c.valorTotal - c.valorPago);
        const pillClasse = c.statusAtual === "VENCIDO" ? "status-vencido" : "status-aberto";
        return `
        <tr>
            <td><span class="status-pill ${pillClasse}">${c.statusAtual === "VENCIDO" ? "Vencido" : "Aberto"}</span></td>
            <td>${c.nomeCliente || "—"}</td>
            <td>${c.descricao || "—"}</td>
            <td>${fmtData(c.dthVencimento)}</td>
            <td>${fmtMoeda(c.valorTotal)}</td>
            <td>${fmtMoeda(c.valorPago)}</td>
            <td class="${restante > 0 ? 'valor-saida' : ''}">${fmtMoeda(restante)}</td>
            <td class="area-acoes">
                <button class="btn-acao btn-receber" title="Receber"
                    onclick="abrirModalReceberConta(${c.idCategoriaFinanceira || c.id})">
                    <i class="bi bi-currency-dollar"></i>
                </button>
                <button class="btn-acao btn-editar" title="Alterar vencimento"
                    onclick="abrirModalAlterarVencimento(${c.idCategoriaFinanceira || c.id})">
                    <i class="bi bi-calendar-event"></i>
                </button>
            </td>
        </tr>`;
    }).join("");
}

// ── Renderizar histórico ──────────────────
function renderizarHistorico() {
    const tbody = document.querySelector("#tabela-historico tbody");
    if (!tbody) return;

    if (!historicoList.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum histórico de caixa.</td></tr>`;
        return;
    }

    tbody.innerHTML = historicoList.map(h => {
        const diff = Number(h.saldoFinal || 0) - Number(h.saldoInicial || 0);
        return `
        <tr>
            <td><span class="status-pill ${h.fechado ? 'status-fechado' : 'status-aberto'}">${h.fechado ? 'Fechado' : 'Aberto'}</span></td>
            <td>${h.nomeOperador || "—"}</td>
            <td>${fmtDataHora(h.dthAbertura)}</td>
            <td>${h.dthFechamento ? fmtDataHora(h.dthFechamento) : "Em aberto"}</td>
            <td>${fmtMoeda(h.saldoInicial)}</td>
            <td>${fmtMoeda(h.saldoFinal)}</td>
            <td class="${diff >= 0 ? 'valor-entrada' : 'valor-saida'}">${fmtMoeda(diff)}</td>
        </tr>`;
    }).join("");
}

// ═══════════════════════════════════════════
// MODAL: ABRIR CAIXA
// ═══════════════════════════════════════════
function abrirModalAbrirCaixa() {
    // Pré-preenche com saldo do último caixa fechado
    const ultimoSaldo = historicoList.find(h => h.fechado)?.saldoFinal || 0;
    document.getElementById("abrir-saldo-inicial").value = ultimoSaldo > 0 ? ultimoSaldo.toFixed(2) : "";
    document.getElementById("modal-abrir-caixa").classList.add("open");
}

function fecharModalAbrirCaixa() {
    document.getElementById("modal-abrir-caixa").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-abrir-caixa")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const saldo = parseFloat(document.getElementById("abrir-saldo-inicial").value) || 0;
        try {
            await apiPost("/Caixa/Abrir", { SaldoInicial: saldo });
            fecharModalAbrirCaixa();
            flexToast("Caixa aberto com sucesso!", "sucesso");
            await inicializar();
        } catch (err) {
            flexToast("Erro ao abrir caixa: " + err.message, "erro");
        }
    });
});

// ═══════════════════════════════════════════
// MODAL: FECHAR CAIXA
// ═══════════════════════════════════════════
function abrirModalFecharCaixa() {
    atualizarPainel(); // garante que os valores estão atualizados
    document.getElementById("modal-fechar-caixa").classList.add("open");

    const btnConfirmar = document.getElementById("confirm-fechar-sim");
    if (btnConfirmar) {
        btnConfirmar.onclick = null;
        btnConfirmar.onclick = confirmarFecharCaixa;
    }
}

function fecharModalFecharCaixa() {
    document.getElementById("modal-fechar-caixa").classList.remove("open");
}

async function confirmarFecharCaixa() {
    const obs = document.getElementById("fechar-obs")?.value || "";
    const saldoFinal = parseFloat(document.getElementById("fechar-saldo-calculado")?.value) || 0;
    try {
        await apiPost("/Caixa/Fechar", { SaldoFinal: saldoFinal, Observacao: obs });
        fecharModalFecharCaixa();
        flexToast("Caixa fechado com sucesso!", "sucesso");
        await inicializar();
    } catch (err) {
        flexToast("Erro ao fechar caixa: " + err.message, "erro");
    }
}

// ═══════════════════════════════════════════
// MODAL: LANÇAMENTO (Despesa / Sangria / Suprimento)
// ═══════════════════════════════════════════
function abrirModalLancamento(tipo) {
    tipoLancamentoAtual = tipo;
    _categoriaSelecionada = null;

    const modal = document.getElementById("modal-lancamento");
    const h3 = modal?.querySelector(".modal-header h3");
    if (h3) h3.textContent = { DESPESA: "Despesa", SANGRIA: "Sangria", SUPRIMENTO: "Suprimento" }[tipo] || tipo;

    // Limpa campos
    document.getElementById("lanc-valor").value = "";
    document.getElementById("lanc-descricao").value = "";
    document.getElementById("lanc-categoria").value = "";

    // Exibe/oculta grupos por tipo
    const grupoCat = document.getElementById("grupo-categoria");
    const grupoFp = document.getElementById("grupo-formapgto");
    if (grupoCat) grupoCat.style.display = tipo === "DESPESA" ? "" : "none";
    if (grupoFp) grupoFp.style.display = tipo === "DESPESA" ? "" : "none";

    // Popula categorias de despesa
    if (tipo === "DESPESA") {
        const lista = document.getElementById("lanc-categoria-lista");
        const cats = categorias.filter(c => c.tipoCategoria === 2 || c.tipo === "DESPESA" || !c.tipoCategoria);
        if (lista) {
            lista.innerHTML = cats.map(c => `
                <div class="wizard-item" onclick="selecionarCategoria(${c.idCategoriaFinanceira}, '${(c.nome || '').replace(/'/g, "\\'")}')">
                    <i class="bi bi-tag-fill wizard-item-check"></i>
                    <div class="wizard-item-info">
                        <div class="wizard-item-nome">${c.nome}</div>
                    </div>
                </div>`).join("") || `<div class="wizard-vazio">Nenhuma categoria encontrada.</div>`;
        }

        // Popula formas de pagamento
        const sel = document.getElementById("lanc-formapgto");
        if (sel) {
            sel.innerHTML = formasPagamento.map(f =>
                `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");
        }
    }

    modal?.classList.add("open");
}

function selecionarCategoria(id, nome) {
    _categoriaSelecionada = id;
    document.getElementById("lanc-categoria").value = id;

    document.querySelectorAll("#lanc-categoria-lista .wizard-item").forEach(el => {
        el.classList.remove("selecionado");
        if (el.textContent.includes(nome)) el.classList.add("selecionado");
    });
}

function fecharModalLancamento() {
    document.getElementById("modal-lancamento").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-lancamento")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const valor = parseFloat(document.getElementById("lanc-valor").value);
        if (!valor || valor <= 0) { flexToast("Informe um valor válido.", "aviso"); return; }

        if (tipoLancamentoAtual === "DESPESA" && !_categoriaSelecionada) {
            flexToast("Selecione uma categoria.", "aviso"); return;
        }

        const payload = {
            Tipo: tipoLancamentoAtual,
            Valor: valor,
            Descricao: document.getElementById("lanc-descricao").value || null,
            IdCategoriaFinanceira: _categoriaSelecionada || null,
            IdFormaPagamento: parseInt(document.getElementById("lanc-formapgto")?.value) || null
        };

        try {
            await apiPost("/Caixa/Lancamento", payload);
            fecharModalLancamento();
            flexToast("Lançamento registrado!", "sucesso");
            const novos = await apiGet("/Caixa/Lancamentos").catch(() => []);
            lancamentos = novos;
            atualizarPainel();
            atualizarBreakdown();
            renderizarLancamentos();
        } catch (err) {
            flexToast("Erro ao lançar: " + err.message, "erro");
        }
    });
});

// ═══════════════════════════════════════════
// MODAL: VENDA RÁPIDA
// ═══════════════════════════════════════════
function abrirModalVendaRapida() {
    _vendaRapidaItens = [];
    _clienteSelecionadoVenda = null;

    document.getElementById("vr-itens-body").innerHTML = "";
    document.getElementById("vr-total").textContent = "R$ 0,00";
    document.getElementById("vr-descricao").value = "";
    document.getElementById("vr-cpf-wrap").style.display = "none";
    document.getElementById("vr-fiado-wrap").style.display = "none";
    document.getElementById("vr-vencimento-wrap").style.display = "none";
    document.getElementById("vr-cpf").value = "";
    document.getElementById("vr-cliente-info").style.display = "none";
    document.getElementById("vr-fiado").checked = false;

    // Popula formas de pagamento
    const sel = document.getElementById("vr-formapgto");
    if (sel) {
        sel.innerHTML = formasPagamento.map(f =>
            `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");
    }

    adicionarItemVenda(); // começa com 1 item
    document.getElementById("modal-venda-rapida").classList.add("open");
}

function fecharModalVendaRapida() {
    document.getElementById("modal-venda-rapida").classList.remove("open");
}

function adicionarItemVenda() {
    const idx = _vendaRapidaItens.length;
    _vendaRapidaItens.push({ idProduto: null, nome: "", quantidade: 1, preco: 0 });

    const tbody = document.getElementById("vr-itens-body");
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
        <td class="col-produto">
            <div class="produto-cell">
                <input type="text" readonly placeholder="Clique para buscar produto..."
                    value="" onclick="abrirBuscaProdutoVR(${idx})">
                <button type="button" class="btn-buscar-produto" onclick="abrirBuscaProdutoVR(${idx})">
                    <i class="bi bi-search"></i>
                </button>
            </div>
        </td>
        <td class="col-qtde">
            <input type="number" min="1" value="1"
                oninput="atualizarItemVenda(${idx}, 'quantidade', this.value)">
        </td>
        <td class="col-preco">
            <input type="number" min="0" step="0.01" value="0.00"
                oninput="atualizarItemVenda(${idx}, 'preco', this.value)">
        </td>
        <td class="col-sub">
            <span class="subtotal-label" id="vr-sub-${idx}">R$ 0,00</span>
        </td>
        <td class="col-del">
            <button type="button" class="btn-del-item" onclick="removerItemVenda(${idx})">
                <i class="bi bi-trash3-fill"></i>
            </button>
        </td>`;
    tbody.appendChild(tr);
}

function atualizarItemVenda(idx, campo, valor) {
    if (!_vendaRapidaItens[idx]) return;
    _vendaRapidaItens[idx][campo] = campo === "quantidade" ? parseInt(valor) || 1 : parseFloat(valor) || 0;
    const sub = _vendaRapidaItens[idx].quantidade * _vendaRapidaItens[idx].preco;
    const subEl = document.getElementById(`vr-sub-${idx}`);
    if (subEl) subEl.textContent = fmtMoeda(sub);
    recalcularTotalVenda();
}

function removerItemVenda(idx) {
    const tr = document.querySelector(`#vr-itens-body tr[data-idx="${idx}"]`);
    if (tr) tr.remove();
    _vendaRapidaItens[idx] = null;
    recalcularTotalVenda();
}

function recalcularTotalVenda() {
    const total = _vendaRapidaItens
        .filter(Boolean)
        .reduce((s, item) => s + item.quantidade * item.preco, 0);
    document.getElementById("vr-total").textContent = fmtMoeda(total);
    document.getElementById("vr-valor").value = total.toFixed(2);
}

// ── Busca de produto (Venda Rápida) ──────
function abrirBuscaProdutoVR(idx) {
    _vrProdutoIdx = idx;
    document.getElementById("input-busca-produto-vr").value = "";
    filtrarListaProdutosVR("");
    document.getElementById("modal-busca-produto-vr").classList.add("open");
}

function fecharBuscaProdutoVR() {
    document.getElementById("modal-busca-produto-vr").classList.remove("open");
}

function filtrarListaProdutosVR(termo) {
    const lista = document.getElementById("lista-busca-produtos-vr");
    const t = (termo || "").toLowerCase();

    const filtrados = produtosCache
        .filter(p => (p.fAtivo === true || p.fAtivo === 1))
        .filter(p => !t || (p.nome || "").toLowerCase().includes(t) || (p.sku || p.skuProduto || "").toLowerCase().includes(t));

    if (!filtrados.length) {
        lista.innerHTML = `<div class="busca-vazia"><i class="bi bi-box-seam"></i>Nenhum produto encontrado.</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(p => `
        <div class="busca-item" onclick="selecionarProdutoVR(${p.idProduto})">
            <div class="busca-item-info">
                <div class="busca-item-nome">${p.nome}</div>
                <div class="busca-item-sub">SKU: ${p.sku || p.skuProduto || "—"}</div>
            </div>
            <span class="busca-item-preco">${fmtMoeda(p.precoVenda || p.PrecoVenda)}</span>
        </div>`).join("");
}

function selecionarProdutoVR(idProduto) {
    const p = produtosCache.find(x => x.idProduto === idProduto);
    if (!p || _vrProdutoIdx === null) return;

    _vendaRapidaItens[_vrProdutoIdx] = {
        idProduto: p.idProduto,
        nome: p.nome,
        quantidade: 1,
        preco: p.precoVenda || p.PrecoVenda || 0
    };

    const tr = document.querySelector(`#vr-itens-body tr[data-idx="${_vrProdutoIdx}"]`);
    if (tr) {
        tr.querySelector("input[readonly]").value = p.nome;
        tr.querySelector("input[type='number']").value = 1;
        tr.querySelectorAll("input[type='number']")[1].value = (p.precoVenda || p.PrecoVenda || 0).toFixed(2);
        const sub = 1 * (p.precoVenda || p.PrecoVenda || 0);
        const subEl = document.getElementById(`vr-sub-${_vrProdutoIdx}`);
        if (subEl) subEl.textContent = fmtMoeda(sub);
    }

    recalcularTotalVenda();
    fecharBuscaProdutoVR();
    _vrProdutoIdx = null;
}

// ── CPF / Fiado (Venda Rápida) ────────────
function toggleCpfVenda() {
    const wrap = document.getElementById("vr-cpf-wrap");
    if (wrap) wrap.style.display = wrap.style.display === "none" ? "" : "none";
}

async function buscarClienteCpf() {
    const cpf = document.getElementById("vr-cpf").value.replace(/\D/g, "");
    if (cpf.length < 11) { flexToast("Informe um CPF válido.", "aviso"); return; }

    const cliente = clientesCache.find(c => (c.cpfCNPJ || "").replace(/\D/g, "") === cpf);
    const infoEl = document.getElementById("vr-cliente-info");
    const fiadoWrap = document.getElementById("vr-fiado-wrap");

    if (!cliente) {
        flexToast("Cliente não encontrado.", "aviso");
        infoEl.style.display = "none";
        fiadoWrap.style.display = "none";
        _clienteSelecionadoVenda = null;
        return;
    }

    _clienteSelecionadoVenda = cliente;
    infoEl.innerHTML = `<i class="bi bi-person-check-fill"></i> ${cliente.nome}`;
    infoEl.style.display = "flex";
    fiadoWrap.style.display = "";
}

function toggleFiado() {
    const checked = document.getElementById("vr-fiado").checked;
    document.getElementById("vr-vencimento-wrap").style.display = checked ? "" : "none";
    document.getElementById("vr-formapgto-wrap").style.display = checked ? "none" : "";
}

// ── Submit Venda Rápida ───────────────────
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-venda-rapida")?.addEventListener("submit", async function (e) {
        e.preventDefault();

        const itens = _vendaRapidaItens.filter(Boolean).filter(i => i.idProduto);
        if (!itens.length) { flexToast("Adicione pelo menos um produto.", "aviso"); return; }

        const valor = parseFloat(document.getElementById("vr-valor").value) || 0;
        if (valor <= 0) { flexToast("Valor inválido.", "aviso"); return; }

        const fiado = document.getElementById("vr-fiado").checked;
        const vencimento = document.getElementById("vr-vencimento").value;

        if (fiado && !vencimento) { flexToast("Informe o vencimento para venda no fiado.", "aviso"); return; }
        if (fiado && !_clienteSelecionadoVenda) { flexToast("Busque e selecione um cliente para venda no fiado.", "aviso"); return; }

        const payload = {
            Itens: itens.map(i => ({ IdProduto: i.idProduto, Quantidade: i.quantidade, PrecoUnitario: i.preco })),
            Valor: valor,
            IdFormaPagamento: parseInt(document.getElementById("vr-formapgto").value) || null,
            Descricao: document.getElementById("vr-descricao").value || null,
            IdCliente: _clienteSelecionadoVenda?.idCliente || null,
            Fiado: fiado,
            DthVencimento: fiado ? vencimento : null
        };

        try {
            await apiPost("/Caixa/VendaRapida", payload);
            fecharModalVendaRapida();
            flexToast("Venda registrada!", "sucesso");
            lancamentos = await apiGet("/Caixa/Lancamentos").catch(() => []);
            atualizarPainel();
            atualizarBreakdown();
            renderizarLancamentos();
        } catch (err) {
            flexToast("Erro ao registrar venda: " + err.message, "erro");
        }
    });
});

// ── Cadastro rápido de produto ────────────
function fecharCadastroProdutoRapido() {
    document.getElementById("modal-novo-produto-rapido")?.classList.remove("open");
}

// ═══════════════════════════════════════════
// MODAL: RECEBER CONTA
// ═══════════════════════════════════════════
function abrirModalReceberConta(id) {
    const conta = contasReceber.find(c => (c.idCategoriaFinanceira || c.id) === id);
    if (!conta) return;

    _contaReceberAtual = conta;
    document.getElementById("receber-categoria-id").value = id;
    document.getElementById("receber-cliente").textContent = conta.nomeCliente || "—";
    const restante = Math.max(0, conta.valorTotal - conta.valorPago);
    document.getElementById("receber-valor-restante").textContent = fmtMoeda(restante);

    const sel = document.getElementById("receber-formapgto");
    if (sel) {
        sel.innerHTML = formasPagamento.map(f =>
            `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");
    }

    document.getElementById("modal-receber-conta").classList.add("open");
}

function fecharModalReceberConta() {
    document.getElementById("modal-receber-conta").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-receber-conta")?.addEventListener("submit", async function (e) {
        e.preventDefault();

        const id = parseInt(document.getElementById("receber-categoria-id").value);
        const valor = parseFloat(document.getElementById("receber-valor").value);
        const idFP = parseInt(document.getElementById("receber-formapgto").value);

        if (!valor || valor <= 0) { flexToast("Informe um valor válido.", "aviso"); return; }

        try {
            await apiPost("/Caixa/ReceberConta", {
                IdCategoriaFinanceira: id,
                Valor: valor,
                IdFormaPagamento: idFP
            });
            fecharModalReceberConta();
            flexToast("Recebimento registrado!", "sucesso");
            [contasReceber, lancamentos] = await Promise.all([
                apiGet("/Caixa/ContasReceber").catch(() => []),
                apiGet("/Caixa/Lancamentos").catch(() => [])
            ]);
            atualizarPainel();
            renderizarContas();
            renderizarLancamentos();
        } catch (err) {
            flexToast("Erro ao registrar recebimento: " + err.message, "erro");
        }
    });
});

// ═══════════════════════════════════════════
// MODAL: ALTERAR VENCIMENTO
// ═══════════════════════════════════════════
let _contaVencimentoAtual = null;

function abrirModalAlterarVencimento(id) {
    _contaVencimentoAtual = id;
    const conta = contasReceber.find(c => (c.idCategoriaFinanceira || c.id) === id);
    if (conta?.dthVencimento) {
        document.getElementById("venc-data").value = conta.dthVencimento.substring(0, 10);
    }
    document.getElementById("modal-alterar-vencimento").classList.add("open");
}

function fecharModalAlterarVencimento() {
    document.getElementById("modal-alterar-vencimento").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form-alterar-vencimento")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const data = document.getElementById("venc-data").value;
        if (!data) { flexToast("Informe a data.", "aviso"); return; }

        try {
            await apiPost("/Caixa/AlterarVencimento", {
                Id: _contaVencimentoAtual,
                NovaData: data
            });
            fecharModalAlterarVencimento();
            flexToast("Vencimento atualizado!", "sucesso");
            contasReceber = await apiGet("/Caixa/ContasReceber").catch(() => []);
            renderizarContas();
        } catch (err) {
            flexToast("Erro: " + err.message, "erro");
        }
    });
});

// ═══════════════════════════════════════════
// FECHAR MODAIS AO CLICAR FORA
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    const modais = [
        ["modal-abrir-caixa", fecharModalAbrirCaixa],
        ["modal-fechar-caixa", fecharModalFecharCaixa],
        ["modal-lancamento", fecharModalLancamento],
        ["modal-venda-rapida", fecharModalVendaRapida],
        ["modal-busca-produto-vr", fecharBuscaProdutoVR],
        ["modal-novo-produto-rapido", fecharCadastroProdutoRapido],
        ["modal-receber-conta", fecharModalReceberConta],
        ["modal-alterar-vencimento", fecharModalAlterarVencimento],
    ];

    modais.forEach(([id, fn]) => {
        document.getElementById(id)?.addEventListener("click", function (e) {
            if (e.target === this) fn();
        });
    });

    // Garante aba inicial
    mudarAba("lancamentos");

    // Inicializa tela
    inicializar();
});