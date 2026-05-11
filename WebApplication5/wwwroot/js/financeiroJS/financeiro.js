// ===== FINANCEIRO.JS — FlexGestor =====

// Arrays principais que armazenam os dados vindos da API para contas a receber
let contasReceber = []; // lista completa
let contasReceberFiltradas = []; // lista após aplicar filtros
let filtroReceber = "todos"; // filtro por status (todos, aberto, vencido, pago)
let filtroReceberTexto = ""; // texto digitado na busca
let pagReceberAtual = 1; // página atual da tabela
const PAG_RECEBER = 15; // quantidade de registros por página

// Arrays principais para contas a pagar (mesma lógica do receber)
let contasPagar = [];
let contasPagarFiltradas = [];
let filtroPagar = "todos";
let filtroPagarTexto = "";
let pagPagarAtual = 1;
const PAG_PAGAR = 15;

// Dados auxiliares carregados da API
let formasPagamento = []; // formas de pagamento disponíveis
let categorias = []; // categorias financeiras
let clientes = []; // clientes cadastrados
let fornecedores = []; // fornecedores cadastrados

// Filtros de período (data de vencimento)
let filtroVencimentoInicioR = null;
let filtroVencimentoFimR = null;
let filtroVencimentoInicioP = null;
let filtroVencimentoFimP = null;

// Configuração de ordenação das tabelas
let ordemReceber = { campo: 'dthVencimento', asc: true };
let ordemPagar = { campo: 'dthVencimento', asc: true };

// Função genérica para GET na API
async function apiGet(url) {
    const res = await fetch(url); // faz requisição
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`); // trata erro HTTP
    return res.json(); // retorna JSON
}

// Função genérica para POST na API
async function apiPost(url, body) {
    const res = await fetch(url, {
        method: "POST", // método HTTP
        headers: { "Content-Type": "application/json" }, // define JSON
        body: JSON.stringify(body) // envia dados
    });
    if (!res.ok) {
        const t = await res.text().catch(() => ""); // tenta pegar mensagem do backend
        throw new Error(t || `POST ${url} → ${res.status}`); // lança erro
    }
    return res;
}

// Função de toast para exibir mensagens ao usuário
function flexToast(msg, tipo = "sucesso") {
    const cores = { sucesso: "#15803d", erro: "#dc2626", aviso: "#d97706" }; // cores por tipo
    const icones = { sucesso: "bi-check-circle-fill", erro: "bi-x-circle-fill", aviso: "bi-exclamation-triangle-fill" }; // ícones
    const t = document.createElement("div"); // cria elemento
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;max-width:36rem;`; // estilo
    t.innerHTML = `<i class="bi ${icones[tipo]}"></i><span>${msg}</span>`; // conteúdo
    document.body.appendChild(t); // adiciona na tela
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; }); // anima entrada
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(-1rem)"; setTimeout(() => t.remove(), 350); }, 3200); // remove após tempo
}

// Formata valor monetário em padrão brasileiro
function fmt(v) {
    return "R$ " + Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formata data para pt-BR
function fmtData(d) {
    if (!d) return "—"; // fallback
    return new Date(d).toLocaleDateString("pt-BR");
}

// Define classe visual do status
function getPillClass(status) {
    if (status === "PAGO") return "pill-pago";
    if (status === "VENCIDO") return "pill-vencido";
    return "pill-aberto";
}

// Define texto do status
function getPillLabel(status) {
    if (status === "PAGO") return "Pago";
    if (status === "VENCIDO") return "Vencido";
    return "Aberto";
}

// Carrega todos os dados do backend
async function carregarTudo() {
    console.log("[carregarTudo] iniciando...");
    try {
        // executa todas as requisições em paralelo
        [contasReceber, contasPagar, formasPagamento, categorias, clientes, fornecedores] = await Promise.all([
            apiGet("/Financeiro/ListarContasReceber"),
            apiGet("/Financeiro/ListarContasPagar"),
            apiGet("/Caixa/FormasPagamento"),
            apiGet("/Caixa/Categorias"),
            apiGet("/Cliente/Listar"),
            apiGet("/Fornecedor/Listar")
        ]);

        console.log("[carregarTudo] contasReceber:", contasReceber.length);

        atualizarKPIs(); // atualiza indicadores
        aplicarFiltroReceber(); // aplica filtros
        aplicarFiltroPagar();
        popularSelects(); // popula dropdowns
        popularSelectsEdicao();

        console.log("[carregarTudo] concluído");
    } catch (err) {
        console.error("[carregarTudo] ERRO:", err.message);
        flexToast("Erro ao carregar dados: " + err.message, "erro");
    }
}

// Atualiza os indicadores financeiros da tela
function atualizarKPIs() {
    const abertas = contasReceber.filter(c => c.statusAtual !== "PAGO"); // contas abertas
    const vencidasR = contasReceber.filter(c => c.statusAtual === "VENCIDO"); // vencidas receber
    const abertoP = contasPagar.filter(c => c.statusAtual !== "PAGO"); // contas abertas pagar
    const vencidasP = contasPagar.filter(c => c.statusAtual === "VENCIDO"); // vencidas pagar

    // calcula totais
    const totalReceber = abertas.reduce((s, c) => s + Math.max(0, c.valorTotal - c.valorPago), 0);
    const totalVencidoR = vencidasR.reduce((s, c) => s + Math.max(0, c.valorTotal - c.valorPago), 0);
    const totalPagar = abertoP.reduce((s, c) => s + Math.max(0, c.valorTotal - c.valorPago), 0);
    const totalVencidoP = vencidasP.reduce((s, c) => s + Math.max(0, c.valorTotal - c.valorPago), 0);

    // atualiza UI
    document.getElementById("kpi-a-receber").textContent = fmt(totalReceber);
    document.getElementById("kpi-vencido-receber").textContent = fmt(totalVencidoR);
    document.getElementById("kpi-a-pagar").textContent = fmt(totalPagar);
    document.getElementById("kpi-vencido-pagar").textContent = fmt(totalVencidoP);
}

// Ordena array com base no campo e direção
function ordenar(arr, ordem) {
    return [...arr].sort((a, b) => {
        let va = a[ordem.campo], vb = b[ordem.campo]; // valores comparados

        if (typeof va === 'string') { // normaliza string
            va = va.toLowerCase();
            vb = (vb ?? '').toLowerCase();
        }

        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;

        return ordem.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
}

// Teste mínimo — adiciona só isso primeiro para confirmar que funciona
function abrirModalNovaReceber() {
    document.getElementById("modal-nova-receber")?.classList.add("open");
}
function fecharModalNovaReceber() {
    document.getElementById("modal-nova-receber")?.classList.remove("open");
}
function mudarAba(aba) {
    document.querySelectorAll(".fin-aba-btn").forEach(b => b.classList.remove("ativa"));
    document.getElementById(`aba-btn-${aba}`)?.classList.add("ativa");
    document.getElementById("painel-receber").style.display = aba === "receber" ? "" : "none";
    document.getElementById("painel-pagar").style.display = aba === "pagar" ? "" : "none";
}
// ── Filtros de período ────────────────────────────────────────────────────
function setFiltroPeriodo(tipo, extremo, valor) {
    if (tipo === "receber") {
        if (extremo === "inicio") filtroVencimentoInicioR = valor || null;
        else filtroVencimentoFimR = valor || null;
        aplicarFiltroReceber();
    } else {
        if (extremo === "inicio") filtroVencimentoInicioP = valor || null;
        else filtroVencimentoFimP = valor || null;
        aplicarFiltroPagar();
    }
}

function setOrdem(tipo, campo) {
    if (tipo === "receber") {
        if (ordemReceber.campo === campo) ordemReceber.asc = !ordemReceber.asc;
        else ordemReceber = { campo, asc: true };
        aplicarFiltroReceber();
    } else {
        if (ordemPagar.campo === campo) ordemPagar.asc = !ordemPagar.asc;
        else ordemPagar = { campo, asc: true };
        aplicarFiltroPagar();
    }
}

// ── Abas ──────────────────────────────────────────────────────────────────
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

function filtrarReceber() {
    filtroReceberTexto = document.getElementById("busca-receber")?.value ?? "";
    pagReceberAtual = 1;
    aplicarFiltroReceber();
}

function filtrarPagar() {
    filtroPagarTexto = document.getElementById("busca-pagar")?.value ?? "";
    pagPagarAtual = 1;
    aplicarFiltroPagar();
}

function aplicarFiltroReceber() {
    const termo = filtroReceberTexto.toLowerCase();
    contasReceberFiltradas = contasReceber.filter(c => {
        const st = (c.statusAtual ?? "ABERTO").toUpperCase();
        if (filtroReceber !== "todos" && st !== filtroReceber.toUpperCase()) return false;
        if (termo && !(c.nomeCliente ?? "").toLowerCase().includes(termo) &&
            !(c.descricao ?? "").toLowerCase().includes(termo)) return false;
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
        const st = (c.statusAtual ?? "ABERTO").toUpperCase();
        if (filtroPagar !== "todos" && st !== filtroPagar.toUpperCase()) return false;
        if (termo && !(c.nomeFornecedor ?? "").toLowerCase().includes(termo) &&
            !(c.descricao ?? "").toLowerCase().includes(termo)) return false;
        if (filtroVencimentoInicioP && new Date(c.dthVencimento) < new Date(filtroVencimentoInicioP)) return false;
        if (filtroVencimentoFimP && new Date(c.dthVencimento) > new Date(filtroVencimentoFimP + "T23:59:59")) return false;
        return true;
    });
    contasPagarFiltradas = ordenar(contasPagarFiltradas, ordemPagar);
    renderizarTabelaPagar();
}

// ── Renderizar tabelas ────────────────────────────────────────────────────
function renderizarTabelaReceber() {
    const tbody = document.querySelector("#tabela-receber tbody");
    if (!tbody) return;
    const total = contasReceberFiltradas.length;
    const inicio = (pagReceberAtual - 1) * PAG_RECEBER;
    const pagina = contasReceberFiltradas.slice(inicio, inicio + PAG_RECEBER);

    // badge aba
    const vencidas = contasReceber.filter(c => c.statusAtual === "VENCIDO").length;
    const badge = document.getElementById("badge-vencido-receber");
    if (badge) { badge.textContent = vencidas; badge.classList.toggle("visivel", vencidas > 0); }

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
                ${status !== "PAGO" ? `<button class="btn-acao btn-pagar-icon" title="Receber" onclick="abrirModalReceberPagamento(${c.idContaReceber})"><i class="bi bi-currency-dollar"></i></button>` : ""}
                <button class="btn-acao btn-calendar-icon" title="Editar" onclick="abrirModalEditarReceber(${c.idContaReceber})"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn-acao" title="Vencimento" onclick="abrirModalVencReceber(${c.idContaReceber})"><i class="bi bi-calendar-event"></i></button>
                <button class="btn-acao" title="Histórico" onclick="abrirHistorico('receber',${c.idContaReceber})"><i class="bi bi-clock-history"></i></button>
                <button class="btn-acao btn-inativar" title="Excluir" onclick="abrirModalExcluirReceber(${c.idContaReceber})"><i class="bi bi-trash3-fill"></i></button>
            </td>
            <td><span class="status-pill ${getPillClass(status)}">${getPillLabel(status)}</span></td>
            <td>${c.nomeCliente ?? "—"}</td>
            <td>${c.descricao ?? "—"}</td>
            <td>${fmtData(c.dthVencimento)}</td>
            <td>${fmt(c.valorTotal)}</td>
            <td>${fmt(c.valorPago)}</td>
            <td class="${restante > 0 ? "valor-negativo" : ""}">${fmt(restante)}</td>
        </tr>`;
    }).join("");
    renderizarPaginacao("receber", total);
}

function renderizarTabelaPagar() {
    const tbody = document.querySelector("#tabela-pagar tbody");
    if (!tbody) return;
    const total = contasPagarFiltradas.length;
    const inicio = (pagPagarAtual - 1) * PAG_PAGAR;
    const pagina = contasPagarFiltradas.slice(inicio, inicio + PAG_PAGAR);

    const vencidas = contasPagar.filter(c => c.statusAtual === "VENCIDO").length;
    const badge = document.getElementById("badge-vencido-pagar");
    if (badge) { badge.textContent = vencidas; badge.classList.toggle("visivel", vencidas > 0); }

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
                ${status !== "PAGO" ? `<button class="btn-acao btn-pagar-icon" title="Pagar" onclick="abrirModalPagarConta(${c.idContaPagar})"><i class="bi bi-currency-dollar"></i></button>` : ""}
                <button class="btn-acao btn-calendar-icon" title="Editar" onclick="abrirModalEditarPagar(${c.idContaPagar})"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn-acao" title="Vencimento" onclick="abrirModalVencPagar(${c.idContaPagar})"><i class="bi bi-calendar-event"></i></button>
                <button class="btn-acao" title="Histórico" onclick="abrirHistorico('pagar',${c.idContaPagar})"><i class="bi bi-clock-history"></i></button>
                <button class="btn-acao btn-inativar" title="Excluir" onclick="abrirModalExcluirPagar(${c.idContaPagar})"><i class="bi bi-trash3-fill"></i></button>
            </td>
            <td><span class="status-pill ${getPillClass(status)}">${getPillLabel(status)}</span></td>
            <td>${c.nomeFornecedor ?? "—"}</td>
            <td>${c.descricao ?? "—"}</td>
            <td>${fmtData(c.dthVencimento)}</td>
            <td>${fmt(c.valorTotal)}</td>
            <td>${fmt(c.valorPago)}</td>
            <td class="${restante > 0 ? "valor-negativo" : ""}">${fmt(restante)}</td>
        </tr>`;
    }).join("");
    renderizarPaginacao("pagar", total);
}

function renderizarPaginacao(tipo, total) {
    const PAG = tipo === "receber" ? PAG_RECEBER : PAG_PAGAR;
    const pag = tipo === "receber" ? pagReceberAtual : pagPagarAtual;
    const totalPags = Math.ceil(total / PAG);
    const ini = total === 0 ? 0 : (pag - 1) * PAG + 1;
    const fim = Math.min(pag * PAG, total);

    const infoEl = document.getElementById(`pag-info-${tipo}`);
    if (infoEl) infoEl.textContent = total === 0 ? "Nenhum registro" : `Mostrando ${ini}–${fim} de ${total}`;

    const ctrl = document.getElementById(`pag-ctrl-${tipo}`);
    if (!ctrl) return;
    ctrl.innerHTML = "";

    const prev = document.createElement("button");
    prev.className = "btn-pagina"; prev.textContent = "‹"; prev.disabled = pag === 1;
    prev.onclick = () => { if (tipo === "receber") pagReceberAtual--; else pagPagarAtual--; tipo === "receber" ? aplicarFiltroReceber() : aplicarFiltroPagar(); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPags; i++) {
        const btn = document.createElement("button");
        btn.className = `btn-pagina${i === pag ? " ativo" : ""}`;
        btn.textContent = i;
        btn.onclick = () => { if (tipo === "receber") pagReceberAtual = i; else pagPagarAtual = i; tipo === "receber" ? aplicarFiltroReceber() : aplicarFiltroPagar(); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement("button");
    next.className = "btn-pagina"; next.textContent = "›"; next.disabled = pag >= totalPags;
    next.onclick = () => { if (tipo === "receber") pagReceberAtual++; else pagPagarAtual++; tipo === "receber" ? aplicarFiltroReceber() : aplicarFiltroPagar(); };
    ctrl.appendChild(next);
}

// ── Popula selects ────────────────────────────────────────────────────────
function popularSelects() {
    // clientes
    const optsClientes = `<option value="">Selecione...</option>` +
        clientes.map(c => `<option value="${c.idCliente}">${c.nome}</option>`).join("");
    ["nr-cliente", "er-cliente"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = optsClientes;
    });

    // formas pagamento
    const optsFP = formasPagamento.map(f => `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");
    ["rp-forma", "pc-forma"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = optsFP;
    });

    // categorias entrada (receber)
    const catEntrada = categorias.filter(c => c.Tipo === 1 || c.tipo === 1);
    const optsCatR = catEntrada.map(c => `<option value="${c.idCategoriaFinanceira}">${c.nome}</option>`).join("");
    const rpCat = document.getElementById("rp-categoria");
    if (rpCat) rpCat.innerHTML = optsCatR;

    // categorias saída (pagar)
    const catSaida = categorias.filter(c => c.Tipo === 2 || c.tipo === 2);
    const optsCatP = catSaida.map(c => `<option value="${c.idCategoriaFinanceira}">${c.nome}</option>`).join("");
    const pcCat = document.getElementById("pc-categoria");
    if (pcCat) pcCat.innerHTML = optsCatP;
}

function popularSelectsEdicao() {
    const optsFornecedor = `<option value="">Nenhum</option>` +
        fornecedores.map(f => `<option value="${f.idFornecedor}">${f.nomeFantasia}</option>`).join("");
    ["np-fornecedor", "ep-fornecedor"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = optsFornecedor;
    });
}

// ── Modal helper ──────────────────────────────────────────────────────────
function abrirModal(id) { document.getElementById(id)?.classList.add("open"); }
function fecharModal(id) { document.getElementById(id)?.classList.remove("open"); }

// ── Nova Conta a Receber ──────────────────────────────────────────────────
function abrirModalNovaReceber() { abrirModal("modal-nova-receber"); }
function fecharModalNovaReceber() { fecharModal("modal-nova-receber"); }

async function salvarNovaReceber() {
    const clienteId = parseInt(document.getElementById("nr-cliente")?.value);
    const valorTotal = parseFloat(document.getElementById("nr-valor")?.value);
    const dthVenc = document.getElementById("nr-vencimento")?.value;
    const descricao = document.getElementById("nr-descricao")?.value || null;
    if (!clienteId || !valorTotal || !dthVenc) { flexToast("Preencha todos os campos obrigatórios.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/CriarContaReceber", { ClienteId: clienteId, ValorTotal: valorTotal, DthVencimento: dthVenc, Descricao: descricao });
        fecharModalNovaReceber();
        flexToast("Conta a receber criada!", "sucesso");
        contasReceber = await apiGet("/Financeiro/ListarContasReceber");
        atualizarKPIs(); aplicarFiltroReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Receber Pagamento ─────────────────────────────────────────────────────
let _idContaReceber = null;
function abrirModalReceberPagamento(id) {
    _idContaReceber = id;
    const c = contasReceber.find(x => x.idContaReceber === id);
    if (!c) return;
    document.getElementById("rp-cliente").textContent = c.nomeCliente ?? "—";
    document.getElementById("rp-restante").textContent = fmt(Math.max(0, c.valorTotal - c.valorPago));
    document.getElementById("rp-valor").value = "";
    abrirModal("modal-receber-pagamento");
}
function fecharModalReceberPagamento() { fecharModal("modal-receber-pagamento"); }

async function confirmarReceber() {
    const valorPago = parseFloat(document.getElementById("rp-valor")?.value);
    const idFP = parseInt(document.getElementById("rp-forma")?.value);
    const idCat = parseInt(document.getElementById("rp-categoria")?.value);
    if (!valorPago || valorPago <= 0) { flexToast("Informe o valor recebido.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/ReceberConta", { IdContaReceber: _idContaReceber, ValorPago: valorPago, IdFormaPagamento: idFP, IdCategoriaFinanceira: idCat });
        fecharModalReceberPagamento();
        flexToast("Recebimento registrado!", "sucesso");
        contasReceber = await apiGet("/Financeiro/ListarContasReceber");
        atualizarKPIs(); aplicarFiltroReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Alterar Vencimento Receber ────────────────────────────────────────────
let _idVencReceber = null;
function abrirModalVencReceber(id) {
    _idVencReceber = id;
    const c = contasReceber.find(x => x.idContaReceber === id);
    if (c) document.getElementById("vr-data").value = c.dthVencimento?.substring(0, 10) ?? "";
    abrirModal("modal-venc-receber");
}
function fecharModalVencReceber() { fecharModal("modal-venc-receber"); }

async function confirmarVencReceber() {
    const data = document.getElementById("vr-data")?.value;
    if (!data) { flexToast("Informe a data.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/AlterarVencimentoReceber", { IdContaReceber: _idVencReceber, NovaData: data });
        fecharModalVencReceber();
        flexToast("Vencimento atualizado!", "sucesso");
        contasReceber = await apiGet("/Financeiro/ListarContasReceber");
        atualizarKPIs(); aplicarFiltroReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Excluir Receber ───────────────────────────────────────────────────────
let _idExcluirReceber = null;
function abrirModalExcluirReceber(id) { _idExcluirReceber = id; abrirModal("modal-excluir-receber"); }
function fecharModalExcluirReceber() { fecharModal("modal-excluir-receber"); }

async function confirmarExcluirReceber() {
    try {
        await apiPost("/Financeiro/ExcluirContaReceber", { Id: _idExcluirReceber });
        fecharModalExcluirReceber();
        flexToast("Conta excluída!", "sucesso");
        contasReceber = await apiGet("/Financeiro/ListarContasReceber");
        atualizarKPIs(); aplicarFiltroReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Editar Receber ────────────────────────────────────────────────────────
function abrirModalEditarReceber(id) {
    const c = contasReceber.find(x => x.idContaReceber === id);
    if (!c) return;
    document.getElementById("er-id").value = id;
    document.getElementById("er-descricao").value = c.descricao ?? "";
    document.getElementById("er-valor").value = c.valorTotal;
    document.getElementById("er-vencimento").value = c.dthVencimento?.substring(0, 10) ?? "";
    document.getElementById("er-cliente").value = c.cliente_id ?? "";
    abrirModal("modal-editar-receber");
}
function fecharModalEditarReceber() { fecharModal("modal-editar-receber"); }

async function salvarEditarReceber() {
    const id = parseInt(document.getElementById("er-id")?.value);
    try {
        await apiPost("/Financeiro/EditarContaReceber", {
            IdContaReceber: id,
            Descricao: document.getElementById("er-descricao")?.value || null,
            ValorTotal: parseFloat(document.getElementById("er-valor")?.value),
            DthVencimento: document.getElementById("er-vencimento")?.value,
            ClienteId: parseInt(document.getElementById("er-cliente")?.value)
        });
        fecharModalEditarReceber();
        flexToast("Conta atualizada!", "sucesso");
        contasReceber = await apiGet("/Financeiro/ListarContasReceber");
        atualizarKPIs(); aplicarFiltroReceber();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Nova Conta a Pagar ────────────────────────────────────────────────────
function abrirModalNovaPagar() { abrirModal("modal-nova-pagar"); }
function fecharModalNovaPagar() { fecharModal("modal-nova-pagar"); }

async function salvarNovaPagar() {
    const valorTotal = parseFloat(document.getElementById("np-valor")?.value);
    const dthVenc = document.getElementById("np-vencimento")?.value;
    const descricao = document.getElementById("np-descricao")?.value || null;
    const fornecedorId = parseInt(document.getElementById("np-fornecedor")?.value) || null;
    if (!valorTotal || !dthVenc) { flexToast("Preencha todos os campos obrigatórios.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/CriarContaPagar", { FornecedorId: fornecedorId, ValorTotal: valorTotal, DthVencimento: dthVenc, Descricao: descricao });
        fecharModalNovaPagar();
        flexToast("Conta a pagar criada!", "sucesso");
        contasPagar = await apiGet("/Financeiro/ListarContasPagar");
        atualizarKPIs(); aplicarFiltroPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Pagar Conta ───────────────────────────────────────────────────────────
let _idContaPagar = null;
function abrirModalPagarConta(id) {
    _idContaPagar = id;
    const c = contasPagar.find(x => x.idContaPagar === id);
    if (!c) return;
    document.getElementById("pc-fornecedor").textContent = c.nomeFornecedor ?? "—";
    document.getElementById("pc-restante").textContent = fmt(Math.max(0, c.valorTotal - c.valorPago));
    document.getElementById("pc-valor").value = "";
    abrirModal("modal-pagar-conta");
}
function fecharModalPagarConta() { fecharModal("modal-pagar-conta"); }

async function confirmarPagar() {
    const valorPago = parseFloat(document.getElementById("pc-valor")?.value);
    const idFP = parseInt(document.getElementById("pc-forma")?.value);
    const idCat = parseInt(document.getElementById("pc-categoria")?.value);
    if (!valorPago || valorPago <= 0) { flexToast("Informe o valor pago.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/PagarConta", { IdContaPagar: _idContaPagar, ValorPago: valorPago, IdFormaPagamento: idFP, IdCategoriaFinanceira: idCat });
        fecharModalPagarConta();
        flexToast("Pagamento registrado!", "sucesso");
        contasPagar = await apiGet("/Financeiro/ListarContasPagar");
        atualizarKPIs(); aplicarFiltroPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Alterar Vencimento Pagar ──────────────────────────────────────────────
let _idVencPagar = null;
function abrirModalVencPagar(id) {
    _idVencPagar = id;
    const c = contasPagar.find(x => x.idContaPagar === id);
    if (c) document.getElementById("vp-data").value = c.dthVencimento?.substring(0, 10) ?? "";
    abrirModal("modal-venc-pagar");
}
function fecharModalVencPagar() { fecharModal("modal-venc-pagar"); }

async function confirmarVencPagar() {
    const data = document.getElementById("vp-data")?.value;
    if (!data) { flexToast("Informe a data.", "aviso"); return; }
    try {
        await apiPost("/Financeiro/AlterarVencimentoPagar", { IdContaPagar: _idVencPagar, NovaData: data });
        fecharModalVencPagar();
        flexToast("Vencimento atualizado!", "sucesso");
        contasPagar = await apiGet("/Financeiro/ListarContasPagar");
        atualizarKPIs(); aplicarFiltroPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Excluir Pagar ─────────────────────────────────────────────────────────
let _idExcluirPagar = null;
function abrirModalExcluirPagar(id) { _idExcluirPagar = id; abrirModal("modal-excluir-pagar"); }
function fecharModalExcluirPagar() { fecharModal("modal-excluir-pagar"); }

async function confirmarExcluirPagar() {
    try {
        await apiPost("/Financeiro/ExcluirContaPagar", { Id: _idExcluirPagar });
        fecharModalExcluirPagar();
        flexToast("Conta excluída!", "sucesso");
        contasPagar = await apiGet("/Financeiro/ListarContasPagar");
        atualizarKPIs(); aplicarFiltroPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Editar Pagar ──────────────────────────────────────────────────────────
function abrirModalEditarPagar(id) {
    const c = contasPagar.find(x => x.idContaPagar === id);
    if (!c) return;
    document.getElementById("ep-id").value = id;
    document.getElementById("ep-descricao").value = c.descricao ?? "";
    document.getElementById("ep-valor").value = c.valorTotal;
    document.getElementById("ep-vencimento").value = c.dthVencimento?.substring(0, 10) ?? "";
    document.getElementById("ep-fornecedor").value = c.fornecedor_id ?? "";
    abrirModal("modal-editar-pagar");
}
function fecharModalEditarPagar() { fecharModal("modal-editar-pagar"); }

async function salvarEditarPagar() {
    const id = parseInt(document.getElementById("ep-id")?.value);
    try {
        await apiPost("/Financeiro/EditarContaPagar", {
            IdContaPagar: id,
            Descricao: document.getElementById("ep-descricao")?.value || null,
            ValorTotal: parseFloat(document.getElementById("ep-valor")?.value),
            DthVencimento: document.getElementById("ep-vencimento")?.value,
            FornecedorId: parseInt(document.getElementById("ep-fornecedor")?.value) || null
        });
        fecharModalEditarPagar();
        flexToast("Conta atualizada!", "sucesso");
        contasPagar = await apiGet("/Financeiro/ListarContasPagar");
        atualizarKPIs(); aplicarFiltroPagar();
    } catch (err) { flexToast(err.message, "erro"); }
}

// ── Histórico ─────────────────────────────────────────────────────────────
async function abrirHistorico(tipo, id) {
    const url = tipo === "receber"
        ? `/Financeiro/HistoricoReceber?idContaReceber=${id}`
        : `/Financeiro/HistoricoPagar?idContaPagar=${id}`;
    try {
        const lista = await apiGet(url);
        const corpo = document.getElementById("hist-corpo");
        if (corpo) {
            corpo.innerHTML = lista.length
                ? `<table style="width:100%;border-collapse:collapse">
                    <thead><tr>
                        <th style="text-align:left;padding:.8rem;border-bottom:2px solid #eee">Data</th>
                        <th style="text-align:left;padding:.8rem;border-bottom:2px solid #eee">Valor</th>
                        <th style="text-align:left;padding:.8rem;border-bottom:2px solid #eee">Obs</th>
                    </tr></thead>
                    <tbody>${lista.map(h => `<tr>
                        <td style="padding:.8rem;border-bottom:1px solid #f0f2f5">${fmtData(h.dthPagamento)}</td>
                        <td style="padding:.8rem;border-bottom:1px solid #f0f2f5">${fmt(h.valorPago)}</td>
                        <td style="padding:.8rem;border-bottom:1px solid #f0f2f5">${h.observacao ?? "—"}</td>
                    </tr>`).join("")}</tbody>
                  </table>`
                : `<p class="empty-state">Nenhum registro.</p>`;
        }
        abrirModal("modal-historico");
    } catch (err) { flexToast(err.message, "erro"); }
}
function fecharHistorico() { fecharModal("modal-historico"); }

// ── Exportar ──────────────────────────────────────────────────────────────
function exportar(tipo, formato) {
    window.open(`/Financeiro/Exportar${formato === "excel" ? "Excel" : "Pdf"}?tipo=${tipo}`, "_blank");
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("fr-todos")?.classList.add("sel-todos");
    document.getElementById("fp-todos")?.classList.add("sel-todos");

    [
        ["modal-nova-receber", fecharModalNovaReceber],
        ["modal-receber-pagamento", fecharModalReceberPagamento],
        ["modal-venc-receber", fecharModalVencReceber],
        ["modal-editar-receber", fecharModalEditarReceber],
        ["modal-excluir-receber", fecharModalExcluirReceber],
        ["modal-nova-pagar", fecharModalNovaPagar],
        ["modal-pagar-conta", fecharModalPagarConta],
        ["modal-venc-pagar", fecharModalVencPagar],
        ["modal-editar-pagar", fecharModalEditarPagar],
        ["modal-excluir-pagar", fecharModalExcluirPagar],
        ["modal-historico", fecharHistorico],
    ].forEach(([id, fn]) => {
        document.getElementById(id)?.addEventListener("click", function (e) {
            if (e.target === this) fn();
        });
    });

    carregarTudo();
});