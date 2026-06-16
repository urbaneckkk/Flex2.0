// ===== PEDIDO.JS — com pagamento integrado ao caixa =====

const ITENS_POR_PAGINA = 10; // quantidade de pedidos exibidos por página
let paginaAtual = 1; // controla a página atual da listagem
let todosPedidos = []; // armazena todos os pedidos vindos da API
let pedidosFiltrados = []; // armazena os pedidos após aplicação de filtros
let clientesCache = []; // cache de clientes carregados da API
let produtosCache = []; // cache de produtos carregados da API
let formasPagamentoCache = []; // cache das formas de pagamento
let categoriaFinanceiraCache = []; // cache de categorias financeiras
let filtroStatusPedido = "todos"; // filtro atual por status
let filtroClienteStr = ""; // texto digitado para filtro por cliente
let itensPedidoAtual = []; // itens do pedido sendo criado/editado
let pagamentosPedidoAtual = []; // pagamentos do pedido atual
let _buscaClientePrefixo = null; // controle interno para busca de cliente
let _buscaProdutoIdx = null; // índice do item que está buscando produto
let _buscaProdutoPrefixo = null; // prefixo do contexto da busca de produto
let _pedidoEmEdicao = null; // pedido atualmente em edição
let _pedidoPagamentoAtual = null; // pedido atualmente sendo pago

// IDs alinhados com tabela StatusPedido do banco
const STATUS_MAP = {
    1: { nome: "Pendente", classe: "pendente" }, // pedido ainda não confirmado
    2: { nome: "Confirmado", classe: "confirmado" }, // pedido confirmado
    3: { nome: "Separando", classe: "separando" }, // itens sendo preparados
    4: { nome: "Enviado", classe: "enviado" }, // pedido enviado
    5: { nome: "Concluído", classe: "concluido" }, // pedido finalizado
    6: { nome: "Cancelado", classe: "cancelado" }, // pedido cancelado
};

// mapeia nomes de status (string) para seus respectivos IDs
const STATUS_NOME_PARA_ID = {
    "PENDENTE": 1,
    "CONFIRMADO": 2,
    "SEPARANDO": 3,
    "ENVIADO": 4,
    "ENTREGUE": 5,
    "CONCLUÍDO": 5,
    "CONCLUIDO": 5,
    "CANCELADO": 6,
};

// resolve o ID do status do pedido independentemente da origem do campo
function resolverStatusId(pedido) {
    if (pedido.statusPedidoId && pedido.statusPedidoId > 0) return pedido.statusPedidoId;
    if (pedido.statusPedido_id && pedido.statusPedido_id > 0) return pedido.statusPedido_id;
    if (pedido.status) return STATUS_NOME_PARA_ID[pedido.status.toUpperCase()] ?? 0;
    return 0;
}

// define quais IDs pertencem a cada filtro de status
const FILTRO_STATUS_IDS = {
    todos: [1, 2, 3, 4, 5, 6],
    pendente: [1],
    confirmado: [2],
    separando: [3],
    enviado: [4],
    concluido: [5],
    cancelado: [6],
};

// formas de pagamento padrão usadas como fallback
const FORMAS_PAGAMENTO = [
    { id: 1, nome: "Dinheiro" },
    { id: 2, nome: "Cartão de Crédito" },
    { id: 3, nome: "Cartão de Débito" },
    { id: 4, nome: "PIX" },
    { id: 5, nome: "Boleto" },
    { id: 6, nome: "Transferência" },
];

// função helper para GET
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}

// função helper para POST
async function apiPost(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let msg = txt;
        try { msg = JSON.parse(txt).mensagem ?? txt; } catch { }
        throw new Error(msg || `POST ${url} → ${res.status}`);
    }
    return res.json().catch(() => null);
}

// exibe um toast na tela com mensagem e tipo (sucesso, erro ou aviso)
function flexToast(msg, tipo = "sucesso") {
    const cores = { sucesso: "#15803d", erro: "#dc2626", aviso: "#d97706" };
    const icones = { sucesso: "bi-check-circle-fill", erro: "bi-x-circle-fill", aviso: "bi-exclamation-triangle-fill" };
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;max-width:40rem;`;
    t.innerHTML = `<i class="bi ${icones[tipo]}"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
    setTimeout(() => {
        t.style.opacity = "0"; t.style.transform = "translateY(-1rem)";
        setTimeout(() => t.remove(), 350);
    }, 3500);
}

// carrega pedidos da API e aplica transformação de status
async function carregarPedidos() {
    try {
        const raw = await apiGet("/Pedido/Listar");
        todosPedidos = raw.map(p => ({ ...p, statusPedidoId: resolverStatusId(p) }));
        aplicarFiltros();
    } catch (err) {
        flexToast("Erro ao carregar pedidos: " + err.message, "erro");
    }
}

// carrega clientes e armazena em cache
async function carregarClientes() {
    try { clientesCache = await apiGet("/Cliente/Listar"); }
    catch (err) { console.warn("Clientes:", err.message); }
}

// carrega produtos e armazena em cache
async function carregarProdutos() {
    try { produtosCache = await apiGet("/Produto/Listar"); }
    catch (err) { console.warn("Produtos:", err.message); }
}

// carrega formas de pagamento ou usa fallback
async function carregarFormasPagamento() {
    try { formasPagamentoCache = await apiGet("/Caixa/FormasPagamento"); }
    catch { formasPagamentoCache = FORMAS_PAGAMENTO; }
}

// carrega categorias financeiras
async function carregarCategorias() {
    try { categoriaFinanceiraCache = await apiGet("/Caixa/Categorias"); }
    catch { categoriaFinanceiraCache = []; }
}

// aplica filtros por status e cliente
function aplicarFiltros() {
    const idsPermitidos = FILTRO_STATUS_IDS[filtroStatusPedido] ?? FILTRO_STATUS_IDS.todos;
    pedidosFiltrados = todosPedidos.filter(p => {
        if (!idsPermitidos.includes(p.statusPedidoId)) return false;
        if (filtroClienteStr) {
            const q = normalizar(filtroClienteStr);
            if (!normalizar(p.nomeCliente).includes(q) &&
                !String(p.numeroPedido).includes(q)) return false;
        }
        return true;
    });
    paginaAtual = 1;
    renderizarTabela();
}

// atualiza filtro de cliente a partir do input
function filtrarCliente() {
    filtroClienteStr = document.getElementById("input-busca-cliente").value.trim();
    aplicarFiltros();
}

// define filtro de status e atualiza UI
function setFiltroStatus(valor) {
    filtroStatusPedido = valor;
    document.querySelectorAll(".btn-status-filtro").forEach(b =>
        b.className = b.className.replace(/\bsel-\S+/g, "").trim());
    document.getElementById(`btn-f-${valor}`)?.classList.add(`sel-${valor}`);
    aplicarFiltros();
}

// formata valor para moeda BRL
function fmtMoeda(v) {
    return `R$ ${Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

// formata data simples
function fmtData(s) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("pt-BR");
}

// formata data e hora
function fmtDataHora(s) {
    if (!s) return "—";
    const local = s.endsWith("Z") ? s.slice(0, -1) : s;
    return new Date(local).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// normaliza string removendo acentos para comparação
function normalizar(s) {
    return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// destaca texto buscado com <mark>
function highlight(texto, busca) {
    if (!busca || !texto) return texto ?? "";
    const re = new RegExp(`(${busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return texto.replace(re, "<mark>$1</mark>");
}

// inicializa estado inicial da tela
document.getElementById("btn-f-todos").classList.add("sel-todos");

// ===== PEDIDO.JS — parte 2: renderização, modais, ações =====
// Este arquivo deve ser incluído APÓS pedido.js na view,
// ou seu conteúdo deve ser colado no final do pedido.js existente.

// ── Variáveis de controle dos modais ──
let _pedidoDetalheAtual = null;

// ════════════════════════════════════════════
// TABELA + PAGINAÇÃO
// ════════════════════════════════════════════
function renderizarTabela() {
    const tbody = document.querySelector("#tabela-pedidos tbody");
    if (!tbody) return;

    const total = pedidosFiltrados.length;
    const totalPags = Math.ceil(total / ITENS_POR_PAGINA);
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const pagina = pedidosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado.</td></tr>`;
        atualizarPaginacao(0);
        return;
    }

    tbody.innerHTML = pagina.map(p => {
        const st = STATUS_MAP[p.statusPedidoId] ?? { nome: p.status ?? "—", classe: "pendente" };
        return `
        <tr>
            <td class="area-acoes">
                <button class="btn-acao btn-ver" title="Ver detalhes"
                    onclick="abrirModalDetalhe(${p.idPedido})">
                    <i class="bi bi-eye-fill"></i>
                </button>
                ${p.statusPedidoId !== 5 && p.statusPedidoId !== 6 ? `
                    <button class="btn-acao btn-editar" title="Editar"
                        onclick="abrirModalEditar(${p.idPedido})">
                        <i class="bi bi-pencil-fill"></i>
                    </button>` : ""}
                ${p.statusPedidoId !== 6 ? `
                <button class="btn-acao btn-cancelar" title="Cancelar"
                    onclick="abrirModalCancelar(${p.idPedido}, '${String(p.numeroPedido).replace(/'/g, "\\'")}')">
                    <i class="bi bi-x-circle-fill"></i>
                </button>` : ""}
            </td>
            <td><strong>#${p.numeroPedido}</strong></td>
            <td>${fmtData(p.dthCriacao)}</td>
            <td>${highlight(p.nomeCliente ?? "—", filtroClienteStr)}</td>
            <td><span class="status-pill status-${st.classe}">${st.nome}</span></td>
            <td>${p.totalItens ?? 0}</td>
            <td class="desconto-valor">${p.desconto > 0 ? "-" + fmtMoeda(p.desconto) : "—"}</td>
            <td class="valor-total">${fmtMoeda(p.valorTotal)}</td>
        </tr>`;
    }).join("");

    atualizarPaginacao(total);
}

function atualizarPaginacao(total) {
    const totalPags = Math.ceil(total / ITENS_POR_PAGINA);
    const ini = total === 0 ? 0 : (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
    const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, total);

    const infoEl = document.querySelector(".paginacao-info");
    if (infoEl) infoEl.textContent = total === 0 ? "Nenhum registro" : `Mostrando ${ini}–${fim} de ${total}`;

    const ctrl = document.querySelector(".paginacao-controles");
    if (!ctrl) return;
    ctrl.innerHTML = "";

    const prev = document.createElement("button");
    prev.className = "btn-pagina"; prev.textContent = "‹"; prev.disabled = paginaAtual === 1;
    prev.onclick = () => { paginaAtual--; renderizarTabela(); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPags; i++) {
        const btn = document.createElement("button");
        btn.className = `btn-pagina${i === paginaAtual ? " ativo" : ""}`;
        btn.textContent = i;
        btn.onclick = () => { paginaAtual = i; renderizarTabela(); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement("button");
    next.className = "btn-pagina"; next.textContent = "›"; next.disabled = paginaAtual >= totalPags;
    next.onclick = () => { paginaAtual++; renderizarTabela(); };
    ctrl.appendChild(next);
}

// ════════════════════════════════════════════
// ABAS DO MODAL NOVO / EDITAR
// ════════════════════════════════════════════
function mudarTabPedido(aba) {
    ["dados", "itens", "pagamento"].forEach(a => {
        document.getElementById(`tab-${a}`)?.classList.toggle("ativo", a === aba);
        document.getElementById(`tab-${a}-btn`)?.classList.toggle("ativo", a === aba);
    });
}

// ════════════════════════════════════════════
// MODAL: NOVO PEDIDO
// ════════════════════════════════════════════
function abrirModalNovoPedido() {
    _pedidoEmEdicao = null;
    itensPedidoAtual = [];
    pagamentosPedidoAtual = [];

    document.getElementById("modal-pedido-titulo").innerHTML =
        '<i class="bi bi-bag-plus-fill"></i> Novo Pedido';
    document.getElementById("pedido-id-cliente").value = "";
    document.getElementById("pedido-nome-cliente").value = "";
    document.getElementById("pedido-canal").value = "LOJA";
    document.getElementById("pedido-previsao").value = "";
    document.getElementById("pedido-obs").value = "";
    document.getElementById("itens-body").innerHTML = "";
    document.getElementById("pagamentos-lista").innerHTML =
        `<div class="pagamentos-empty"><i class="bi bi-credit-card"></i>Nenhum pagamento adicionado</div>`;

    atualizarResumo();
    mudarTabPedido("dados");
    document.getElementById("modal-pedido").classList.add("open");
}

function fecharModalPedido() {
    document.getElementById("modal-pedido").classList.remove("open");
    _pedidoEmEdicao = null;
}

// ════════════════════════════════════════════
// MODAL: EDITAR PEDIDO
// ════════════════════════════════════════════
async function abrirModalEditar(idPedido) {
    const pedido = todosPedidos.find(p => p.idPedido === idPedido);
    if (!pedido) return;

    if (pedido.statusPedidoId === 5 || pedido.statusPedidoId === 6) {
        flexToast("Não é possível editar pedidos concluídos ou cancelados.", "aviso");
        return;
    }

    _pedidoEmEdicao = idPedido;
    itensPedidoAtual = [];
    pagamentosPedidoAtual = [];

    document.getElementById("modal-pedido-titulo").innerHTML =
        `<i class="bi bi-pencil-fill"></i> Editar Pedido #${pedido.numeroPedido}`;
    document.getElementById("pedido-id-cliente").value = pedido.idCliente;
    document.getElementById("pedido-nome-cliente").value = pedido.nomeCliente ?? "";
    document.getElementById("pedido-canal").value = pedido.canal ?? "LOJA";
    document.getElementById("pedido-previsao").value = pedido.dthPrevisaoEntrega
        ? pedido.dthPrevisaoEntrega.substring(0, 10) : "";
    document.getElementById("pedido-obs").value = pedido.observacao ?? "";

    // Carrega itens
    try {
        const itens = await apiGet(`/Pedido/ListarItens?idPedido=${idPedido}`);
        itensPedidoAtual = itens.map(i => ({
            idProduto: i.idProduto,
            nome: i.nomeProduto,
            quantidade: i.quantidade,
            preco: i.valorUnitario,
            desconto: i.desconto
        }));
        renderizarItensModal();
    } catch { /* mantém vazio */ }

    // Carrega pagamentos
    try {
        const pags = await apiGet(`/Pedido/ListarPagamentos?idPedido=${idPedido}`);
        pagamentosPedidoAtual = pags.map(p => ({
            idFormaPagamento: p.formaPagamento_id ?? p.idFormaPagamento ?? 1,
            valor: p.valor ?? 0,
            dthPagamento: p.dthPagamento
                ? p.dthPagamento.substring(0, 10)
                : new Date().toISOString().split("T")[0]
        }));
        renderizarPagamentosModal();
    } catch { /* mantém vazio */ }

    atualizarResumo();
    mudarTabPedido("dados");
    document.getElementById("modal-pedido").classList.add("open");
}

// ════════════════════════════════════════════
// ITENS DO PEDIDO
// ════════════════════════════════════════════
function adicionarItemPedido() {
    const idx = itensPedidoAtual.length;
    itensPedidoAtual.push({ idProduto: null, nome: "", quantidade: 1, preco: 0, desconto: 0 });
    renderizarItensModal();
}

function renderizarItensModal() {
    const tbody = document.getElementById("itens-body");
    if (!tbody) return;

    if (!itensPedidoAtual.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhum item adicionado.</td></tr>`;
        return;
    }

    tbody.innerHTML = itensPedidoAtual.map((item, idx) => `
        <tr data-idx="${idx}">
            <td class="col-produto">
                <div class="produto-cell">
                    <input type="text" readonly placeholder="Selecionar produto..."
                        value="${item.nome || ""}"
                        onclick="abrirBuscaProduto(${idx})">
                    <button type="button" class="btn-buscar-produto"
                        onclick="abrirBuscaProduto(${idx})">
                        <i class="bi bi-search"></i>
                    </button>
                </div>
            </td>
            <td class="col-qtde">
                <input type="number" min="1" value="${item.quantidade}"
                    oninput="atualizarItem(${idx}, 'quantidade', this.value)">
            </td>
            <td class="col-preco">
                <input type="number" min="0" step="0.01" value="${item.preco.toFixed(2)}"
                    oninput="atualizarItem(${idx}, 'preco', this.value)">
            </td>
            <td class="col-desc">
                <input type="number" min="0" step="0.01" value="${item.desconto.toFixed(2)}"
                    oninput="atualizarItem(${idx}, 'desconto', this.value)">
            </td>
            <td class="col-sub">
                <span class="subtotal-label">${fmtMoeda(item.quantidade * item.preco - item.desconto)}</span>
            </td>
            <td class="col-del">
                <button type="button" class="btn-del-item" onclick="removerItem(${idx})">
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </td>
        </tr>`).join("");

    atualizarResumo();
}

function atualizarItem(idx, campo, valor) {
    if (!itensPedidoAtual[idx]) return;
    itensPedidoAtual[idx][campo] = campo === "quantidade"
        ? parseInt(valor) || 1
        : parseFloat(valor) || 0;
    renderizarItensModal();
}

function removerItem(idx) {
    itensPedidoAtual.splice(idx, 1);
    renderizarItensModal();
}

function atualizarResumo() {
    const subtotal = itensPedidoAtual.reduce((s, i) => s + i.quantidade * i.preco, 0);
    const descTotal = itensPedidoAtual.reduce((s, i) => s + i.desconto, 0);
    const total = subtotal - descTotal;
    const totalPago = pagamentosPedidoAtual.reduce((s, p) => s + p.valor, 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("resumo-subtotal", fmtMoeda(subtotal));
    set("resumo-desconto", `-${fmtMoeda(descTotal)}`);
    set("resumo-total", fmtMoeda(total));
    set("pag-total-pedido", fmtMoeda(total));
    set("pag-valor-pago", fmtMoeda(totalPago));
    set("pag-valor-pendente", fmtMoeda(Math.max(0, total - totalPago)));
}

// ════════════════════════════════════════════
// BUSCA DE CLIENTE
// ════════════════════════════════════════════
async function abrirBuscaCliente() {
    const lista = document.getElementById("lista-busca-clientes");
    document.getElementById("input-busca-cliente-modal").value = "";
    document.getElementById("modal-busca-cliente").classList.add("open");

    if (!clientesCache.length) {
        lista.innerHTML = `<div class="busca-vazia"><i class="bi bi-hourglass-split"></i> Carregando...</div>`;
        await carregarClientes();
    }

    filtrarListaClientes("");
}

function fecharBuscaCliente() {
    document.getElementById("modal-busca-cliente").classList.remove("open");
}

function filtrarListaClientes(termo) {
    const lista = document.getElementById("lista-busca-clientes");
    const t = normalizar(termo);
    const filtrados = clientesCache
        .filter(c => c.fAtivo !== false && c.fAtivo !== 0)
        .filter(c => !t ||
            normalizar(c.nome).includes(t) ||
            normalizar(c.nomeFantasia ?? "").includes(t) ||
            (c.cpfCNPJ ?? "").replace(/\D/g, "").includes(t.replace(/\D/g, "")));

    if (!filtrados.length) {
        lista.innerHTML = `<div class="busca-vazia"><i class="bi bi-people"></i>Nenhum cliente encontrado.</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(c => `
        <div class="busca-item" onclick="selecionarCliente(${c.idCliente}, '${(c.nome ?? "").replace(/'/g, "\\'")}')">
            <div class="busca-item-info">
                <div class="busca-item-nome">${c.nome ?? "—"}</div>
                <div class="busca-item-sub">${c.cpfCNPJ ?? "—"}</div>
            </div>
        </div>`).join("");
}

function selecionarCliente(id, nome) {
    document.getElementById("pedido-id-cliente").value = id;
    document.getElementById("pedido-nome-cliente").value = nome;
    fecharBuscaCliente();
}

// ════════════════════════════════════════════
// BUSCA DE PRODUTO
// ════════════════════════════════════════════
function abrirBuscaProduto(idx) {
    _buscaProdutoIdx = idx;
    document.getElementById("input-busca-produto-modal").value = "";
    filtrarListaProdutos("");
    document.getElementById("modal-busca-produto").classList.add("open");
}

function fecharBuscaProduto() {
    document.getElementById("modal-busca-produto").classList.remove("open");
    _buscaProdutoIdx = null;
}

function filtrarListaProdutos(termo) {
    const lista = document.getElementById("lista-busca-produtos");
    const t = (termo || "").toLowerCase();
    const filtrados = produtosCache
        .filter(p => p.fAtivo === true || p.fAtivo === 1)
        .filter(p => !t ||
            (p.nome ?? "").toLowerCase().includes(t) ||
            (p.sku ?? p.skuProduto ?? "").toLowerCase().includes(t));

    if (!filtrados.length) {
        lista.innerHTML = `<div class="busca-vazia"><i class="bi bi-box-seam"></i>Nenhum produto encontrado.</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(p => `
        <div class="busca-item" onclick="selecionarProduto(${p.idProduto})">
            <div class="busca-item-info">
                <div class="busca-item-nome">${highlight(p.nome ?? "—", t)}</div>
                <div class="busca-item-sub">SKU: ${p.sku ?? p.skuProduto ?? "—"}</div>
            </div>
            <span class="busca-item-preco">${fmtMoeda(p.precoVenda ?? p.PrecoVenda)}</span>
        </div>`).join("");
}

function selecionarProduto(idProduto) {
    if (_buscaProdutoIdx === null) return;
    const p = produtosCache.find(x => x.idProduto === idProduto);
    if (!p) return;

    itensPedidoAtual[_buscaProdutoIdx] = {
        idProduto: p.idProduto,
        nome: p.nome,
        quantidade: 1,
        preco: p.precoVenda ?? p.PrecoVenda ?? 0,
        desconto: 0
    };

    fecharBuscaProduto();
    renderizarItensModal();
}

// ════════════════════════════════════════════
// PAGAMENTOS
// ════════════════════════════════════════════
function adicionarPagamento() {
    if (!formasPagamentoCache.length) { flexToast("Carregando formas de pagamento...", "aviso"); return; }

    const idx = pagamentosPedidoAtual.length;
    pagamentosPedidoAtual.push({
        idFormaPagamento: formasPagamentoCache[0]?.idFormaPagamento ?? 1,
        valor: 0,
        dthPagamento: new Date().toISOString().split("T")[0]
    });
    renderizarPagamentosModal();
}

function renderizarPagamentosModal() {
    const lista = document.getElementById("pagamentos-lista");
    if (!lista) return;

    if (!pagamentosPedidoAtual.length) {
        lista.innerHTML = `<div class="pagamentos-empty"><i class="bi bi-credit-card"></i>Nenhum pagamento adicionado</div>`;
        atualizarResumo();
        return;
    }

    const opcoesForma = formasPagamentoCache.map(f =>
        `<option value="${f.idFormaPagamento}">${f.nome}</option>`).join("");

    lista.innerHTML = pagamentosPedidoAtual.map((pag, idx) => `
        <div class="pagamento-item">
            <div>
                <span class="pagamento-label">Forma</span>
                <select class="pagamento-select"
                    onchange="atualizarPagamento(${idx}, 'idFormaPagamento', this.value)">
                    ${opcoesForma.replace(
        `value="${pag.idFormaPagamento}"`,
        `value="${pag.idFormaPagamento}" selected`
    )}
                </select>
            </div>
            <div>
                <span class="pagamento-label">Data</span>
                <input type="date" class="pagamento-data-input"
                    value="${pag.dthPagamento ?? new Date().toISOString().split("T")[0]}"
                    onchange="atualizarPagamento(${idx}, 'dthPagamento', this.value)">
            </div>
            <div>
                <span class="pagamento-label">Valor (R$)</span>
                <div class="pagamento-valor-wrap">
                    <span class="pagamento-cifrao">R$</span>
                    <input type="number" class="pagamento-valor-input"
                        min="0" step="0.01"
                        value="${pag.valor.toFixed(2)}"
                        oninput="atualizarPagamento(${idx}, 'valor', this.value)">
                </div>
            </div>
            <div class="pagamento-item-del">
                <button type="button" class="btn-del-item" onclick="removerPagamento(${idx})">
                    <i class="bi bi-trash3-fill"></i>
                </button>
            </div>
        </div>`).join("");

    atualizarResumo();
}

function atualizarPagamento(idx, campo, valor) {
    if (!pagamentosPedidoAtual[idx]) return;
    pagamentosPedidoAtual[idx][campo] = campo === "valor"
        ? parseFloat(valor) || 0
        : campo === "idFormaPagamento" ? parseInt(valor) : valor;
    atualizarResumo();
}

function removerPagamento(idx) {
    pagamentosPedidoAtual.splice(idx, 1);
    renderizarPagamentosModal();
}

// ════════════════════════════════════════════
// SALVAR PEDIDO
// ════════════════════════════════════════════
async function salvarPedido() {
    const idCliente = parseInt(document.getElementById("pedido-id-cliente").value);
    if (!idCliente) { flexToast("Selecione um cliente.", "aviso"); mudarTabPedido("dados"); return; }
    if (!itensPedidoAtual.filter(i => i.idProduto).length) {
        flexToast("Adicione pelo menos um produto.", "aviso"); mudarTabPedido("itens"); return;
    }

    const subtotal = itensPedidoAtual.reduce((s, i) => s + i.quantidade * i.preco, 0);
    const descTotal = itensPedidoAtual.reduce((s, i) => s + i.desconto, 0);
    const total = subtotal - descTotal;

    const btn = document.getElementById("btn-salvar-pedido");
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Salvando...';

    try {
        if (_pedidoEmEdicao) {
            // Edição
            const pedidoAtual = todosPedidos.find(p => p.idPedido === _pedidoEmEdicao);
            await apiPost("/Pedido/Editar", {
                IdPedido: _pedidoEmEdicao,
                StatusPedidoId: pedidoAtual?.statusPedidoId || 1,
                Desconto: descTotal,
                ValorFrete: 0,
                Observacao: document.getElementById("pedido-obs").value || null,
                DthPrevisaoEntrega: document.getElementById("pedido-previsao").value || null,
                Itens: itensPedidoAtual.filter(i => i.idProduto).map(i => ({
                    IdProduto: i.idProduto, Quantidade: i.quantidade,
                    ValorUnitario: i.preco, Desconto: i.desconto,
                    ValorTotal: i.quantidade * i.preco - i.desconto
                })),
                Pagamentos: pagamentosPedidoAtual.map(p => ({
                    FormaPagamento_id: p.idFormaPagamento,
                    Valor: p.valor,
                    DthPagamento: p.dthPagamento
                }))
            });
            flexToast("Pedido atualizado!", "sucesso");
        } else {
            // Criação
            await apiPost("/Pedido/Criar", {
                Pedido: {
                    IdCliente: idCliente,
                    Canal: document.getElementById("pedido-canal").value,
                    Observacao: document.getElementById("pedido-obs").value || null,
                    DthPrevisaoEntrega: document.getElementById("pedido-previsao").value || null,
                    ValorTotal: total,
                    ValorFrete: 0,
                    Desconto: descTotal,
                    StatusPedidoId: 1
                },
                Itens: itensPedidoAtual.filter(i => i.idProduto).map(i => ({
                    IdProduto: i.idProduto, Quantidade: i.quantidade,
                    ValorUnitario: i.preco, Desconto: i.desconto,
                    ValorTotal: i.quantidade * i.preco - i.desconto
                })),
                Pagamentos: pagamentosPedidoAtual.map(p => ({
                    FormaPagamento_id: p.idFormaPagamento,
                    Valor: p.valor,
                    DthPagamento: p.dthPagamento
                }))
            });
            flexToast("Pedido criado!", "sucesso");
        }

        fecharModalPedido();
        await carregarPedidos();
    } catch (err) {
        flexToast("Erro ao salvar pedido: " + err.message, "erro");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar Pedido';
    }
}

// ════════════════════════════════════════════
// MODAL: DETALHES DO PEDIDO
// ════════════════════════════════════════════
async function abrirModalDetalhe(idPedido) {
    const pedido = todosPedidos.find(p => p.idPedido === idPedido);
    if (!pedido) return;

    _pedidoDetalheAtual = pedido;

    const st = STATUS_MAP[pedido.statusPedidoId] ?? { nome: pedido.status ?? "—", classe: "pendente" };

    document.getElementById("detalhe-titulo").innerHTML =
        `<i class="bi bi-bag-check-fill"></i> Pedido #${pedido.numeroPedido}`;
    document.getElementById("det-numero").textContent = `#${pedido.numeroPedido}`;
    document.getElementById("det-status").innerHTML =
        `<span class="status-pill status-${st.classe}">${st.nome}</span>`;
    document.getElementById("det-cliente").textContent = pedido.nomeCliente ?? "—";
    document.getElementById("det-canal").textContent = pedido.canal ?? "—";
    document.getElementById("det-data").textContent = fmtData(pedido.dthCriacao);
    document.getElementById("det-previsao").textContent = pedido.dthPrevisaoEntrega ? fmtData(pedido.dthPrevisaoEntrega) : "—";
    document.getElementById("det-total").textContent = fmtMoeda(pedido.valorTotal);
    document.getElementById("det-obs").textContent = pedido.observacao || "—";

    // Pre-seleciona status e bloqueia controles se pedido terminal
    const bloqueado = pedido.statusPedidoId === 5 || pedido.statusPedidoId === 6;
    const selStatus = document.getElementById("det-novo-status");
    const obsStatus = document.getElementById("det-obs-status");
    const btnAtualizarStatus = document.getElementById("btn-atualizar-status");

    if (selStatus) { selStatus.value = pedido.statusPedidoId; selStatus.disabled = bloqueado; }
    if (obsStatus) { obsStatus.disabled = bloqueado; if (bloqueado) obsStatus.value = ""; }
    if (btnAtualizarStatus) btnAtualizarStatus.disabled = bloqueado;

    mudarTabDetalhe("resumo");

    // Carrega itens
    try {
        const itens = await apiGet(`/Pedido/ListarItens?idPedido=${idPedido}`);
        const tbodyItens = document.getElementById("det-itens-body");
        if (tbodyItens) {
            tbodyItens.innerHTML = itens.map(i => `
                <tr>
                    <td>${i.nomeProduto}</td>
                    <td>${i.quantidade}</td>
                    <td>${fmtMoeda(i.valorUnitario)}</td>
                    <td>${i.desconto > 0 ? fmtMoeda(i.desconto) : "—"}</td>
                    <td class="subtotal-label">${fmtMoeda(i.valorTotal)}</td>
                </tr>`).join("");
        }
    } catch { /* silencioso */ }

    document.getElementById("modal-detalhe-pedido").classList.add("open");

}

function fecharModalDetalhe() {
    document.getElementById("modal-detalhe-pedido").classList.remove("open");
    const mlEl = document.getElementById("det-ml-cancelamento");
    if (mlEl) mlEl.innerHTML = "";
    _pedidoDetalheAtual = null;
}

function mudarTabDetalhe(aba) {
    ["resumo", "historico", "pagamentos"].forEach(a => {
        document.getElementById(`det-tab-${a}`)?.classList.toggle("ativo", a === aba);
        document.getElementById(`det-tab-${a}-btn`)?.classList.toggle("ativo", a === aba);
    });

    if (aba === "historico" && _pedidoDetalheAtual) carregarHistoricoDetalhe(_pedidoDetalheAtual.idPedido);
    if (aba === "pagamentos" && _pedidoDetalheAtual) carregarPagamentosDetalhe(_pedidoDetalheAtual.idPedido);
}

async function carregarHistoricoDetalhe(idPedido) {
    const container = document.getElementById("historico-timeline");
    if (!container) return;
    try {
        const hist = await apiGet(`/Pedido/ListarHistorico?idPedido=${idPedido}`);
        if (!hist.length) {
            container.innerHTML = `<div class="empty-state">Nenhum histórico disponível.</div>`;
            return;
        }
        container.innerHTML = hist.map(h => {
            const st = STATUS_MAP[h.statusPedido_id] ?? { nome: "—", classe: "pendente" };
            return `
            <div class="historico-item">
                <div class="historico-dot"><i class="bi bi-circle-fill" style="font-size:.8rem"></i></div>
                <div class="historico-conteudo">
                    <div class="historico-status">
                        <span class="status-pill status-${st.classe}">${st.nome}</span>
                    </div>
                    <div class="historico-data">${fmtDataHora(h.dthAlteracao)} — ${h.nomeUsuario ?? "Sistema"}</div>
                    ${h.observacao ? `<div class="historico-obs">${h.observacao}</div>` : ""}
                </div>
            </div>`;
        }).join("");
    } catch {
        container.innerHTML = `<div class="empty-state">Erro ao carregar histórico.</div>`;
    }
}

async function carregarPagamentosDetalhe(idPedido) {
    const container = document.getElementById("det-pagamentos-lista");
    if (!container) return;
    try {
        const pags = await apiGet(`/Pedido/ListarPagamentos?idPedido=${idPedido}`);
        const total = _pedidoDetalheAtual?.valorTotal ?? 0;
        const pago = pags.reduce((s, p) => s + p.valor, 0);

        document.getElementById("det-pag-total").textContent = fmtMoeda(total);
        document.getElementById("det-pag-pago").textContent = fmtMoeda(pago);
        document.getElementById("det-pag-pendente").textContent = fmtMoeda(Math.max(0, total - pago));

        if (!pags.length) {
            container.innerHTML = `<div class="pagamentos-empty"><i class="bi bi-credit-card"></i>Nenhum pagamento registrado</div>`;
            return;
        }
        container.innerHTML = pags.map(p => {
            const nomeFP = p.nomeFP
                ?? formasPagamentoCache.find(f => f.id === p.formaPagamento_id)?.nome
                ?? "—";
            return `
            <div class="pagamento-item" style="cursor:default">
                <div><span class="pagamento-label">Forma</span><div>${nomeFP}</div></div>
                <div><span class="pagamento-label">Data</span><div>${fmtData(p.dthPagamento)}</div></div>
                <div><span class="pagamento-label">Valor</span><div class="subtotal-label">${fmtMoeda(p.valor)}</div></div>
                <div></div>
            </div>`;
        }).join("");
    } catch {
        container.innerHTML = `<div class="empty-state">Erro ao carregar pagamentos.</div>`;
    }
}

// ════════════════════════════════════════════
// ATUALIZAR STATUS
// ════════════════════════════════════════════
async function atualizarStatusPedido() {
    if (!_pedidoDetalheAtual) return;
    const statusAtual = resolverStatusId(_pedidoDetalheAtual);
    if (statusAtual === 5 || statusAtual === 6) {
        flexToast("Não é possível alterar o status de pedidos concluídos ou cancelados.", "aviso");
        return;
    }
    const novoStatus = parseInt(document.getElementById("det-novo-status").value);
    const obs = document.getElementById("det-obs-status").value || null;

    try {
        await apiPost("/Pedido/AtualizarStatus", {
            IdPedido: _pedidoDetalheAtual.idPedido,
            StatusPedidoId: novoStatus,
            Observacao: obs
        });
        flexToast("Status atualizado!", "sucesso");
        fecharModalDetalhe();
        await carregarPedidos();
    } catch (err) {
        flexToast("Erro ao atualizar status: " + err.message, "erro");
    }
}

// ════════════════════════════════════════════
// MODAL: CANCELAR PEDIDO
// ════════════════════════════════════════════
function abrirModalCancelar(idPedido, numeroPedido) {
    document.getElementById("cancelar-id-pedido").value = idPedido;
    document.getElementById("cancelar-numero").textContent = `#${numeroPedido}`;
    document.getElementById("cancelar-motivo").value = "";
    document.getElementById("modal-cancelar-pedido").classList.add("open");
}

function fecharModalCancelar() {
    document.getElementById("modal-cancelar-pedido").classList.remove("open");
}

async function confirmarCancelarPedido() {
    const id = parseInt(document.getElementById("cancelar-id-pedido").value);
    const motivo = document.getElementById("cancelar-motivo").value || null;

    try {
        await apiPost("/Pedido/Cancelar", { IdPedido: id, Observacao: motivo });
        flexToast("Pedido cancelado.", "sucesso");
        fecharModalCancelar();
        await carregarPedidos();
    } catch (err) {
        flexToast(err.message, "erro");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    carregarPedidos();
    carregarProdutos();
    carregarClientes();
    carregarFormasPagamento();

    [
        ["modal-pedido", fecharModalPedido],
        ["modal-detalhe-pedido", fecharModalDetalhe],
        ["modal-cancelar-pedido", fecharModalCancelar],
        ["modal-busca-cliente", fecharBuscaCliente],
        ["modal-busca-produto", fecharBuscaProduto],
    ].forEach(([id, fn]) => {
        document.getElementById(id)?.addEventListener("click", function (e) {
            if (e.target === this) fn();
        });
    });
});