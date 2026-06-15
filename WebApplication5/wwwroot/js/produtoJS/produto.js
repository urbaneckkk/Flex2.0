// ===== PRODUTO.JS — FlexGestor =====

const ITENS_POR_PAGINA = 15;
let lista = [];
let listaFiltrada = [];
let filtroTexto = "";
let filtroStatus = "todos";
let categorias = [];
let modoEdicao = null;
let produtoFiscalAtual = null;
let paginaAtual = 1;
let _idStatusAlvo = null;

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
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `POST ${url} → ${res.status}`);
    }
    return res.json().catch(() => null);
}

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

async function carregarProdutos() {
    try {
        lista = await apiGet("/Produto/Listar");
        aplicarFiltros();
    } catch (err) {
        flexToast("Erro ao carregar produtos: " + err.message, "erro");
    }
}

async function carregarCategorias() {
    try {
        categorias = await apiGet("/CategoriaProduto/Listar");
        const ativas = categorias.filter(c => c.fAtivo);
        const opcoes = `<option value="">Selecione...</option>` +
            ativas.map(c => `<option value="${c.idCategoria}">${c.nome}</option>`).join("");
        document.querySelectorAll(".sel-categoria").forEach(sel => sel.innerHTML = opcoes);
        const porId = document.getElementById("prod-categoria");
        if (porId) porId.innerHTML = opcoes;
    } catch (err) {
        console.warn("Categorias:", err.message);
    }
}

function setFiltroStatus(valor) {
    filtroStatus = valor;
    document.querySelectorAll(".btn-status-filtro")
        .forEach(b => b.classList.remove("ativo-sel", "ativo-on", "ativo-off"));
    const mapa = { todos: "ativo-sel", ativo: "ativo-on", inativo: "ativo-off" };
    document.getElementById(`btn-filtro-${valor}`)?.classList.add(mapa[valor]);
    aplicarFiltros();
}

function filtrarTabela() {
    filtroTexto = document.getElementById("input-termo-busca")?.value?.trim() ?? "";
    paginaAtual = 1;
    aplicarFiltros();
}

function aplicarFiltros() {
    const termo = filtroTexto.toLowerCase();
    listaFiltrada = lista.filter(p => {
        const ativo = p.fAtivo === true || p.fAtivo === 1;
        if (filtroStatus === "ativo" && !ativo) return false;
        if (filtroStatus === "inativo" && ativo) return false;
        if (termo && !(p.nome ?? "").toLowerCase().includes(termo)) return false;
        return true;
    });
    paginaAtual = 1;
    renderizarTabela();
}

function fmtMoeda(v) {
    return v != null ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "—";
}

function lerCampo(id) {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : null;
}

function renderizarTabela() {
    const tbody = document.querySelector("#tabela-produtos tbody");
    if (!tbody) return;

    const total = listaFiltrada.length;
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const pagina = listaFiltrada.slice(inicio, inicio + ITENS_POR_PAGINA);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum produto encontrado.</td></tr>`;
        atualizarPaginacao(0);
        return;
    }

    tbody.innerHTML = pagina.map(p => {
        const ativo = p.fAtivo === true || p.fAtivo === 1;
        const idProd = p.idProduto ?? p.IdProduto;

        return `<tr>
            <td class="area-acoes">
                <button class="btn-acao btn-editar" title="Editar" onclick="abrirModalEdicao(${idProd})">
                    <i class="bi bi-pencil-fill"></i>
                </button>
                <!--
                <button class="btn-acao btn-fiscal" title="Dados Fiscais" onclick="abrirModalFiscal(${idProd})">
                    <i class="bi bi-file-earmark-text-fill"></i>
                </button>
                -->
                <button class="btn-acao ${ativo ? "btn-inativar" : "btn-reativar"}"
                    title="${ativo ? "Inativar" : "Reativar"}"
                    onclick="abrirModalStatus(${idProd})">
                    <i class="bi bi-${ativo ? "dash-circle-fill" : "check-circle-fill"}"></i>
                </button>
            </td>
            <td><span class="status-pill status-${ativo ? "ativo" : "inativo"}">${ativo ? "Ativo" : "Inativo"}</span></td>
            <td>${p.nome ?? "—"}</td>
            <td>${p.sku ?? p.skuProduto ?? "—"}</td>
            <td>${p.nomeCategoria ?? "—"}</td>
            <td>${fmtMoeda(p.precoCusto ?? p.PrecoCusto)}</td>
            <td>${fmtMoeda(p.precoVenda ?? p.PrecoVenda)}</td>
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
    next.className = "btn-pagina"; next.textContent = "›";
    next.disabled = paginaAtual >= totalPags || totalPags === 0;
    next.onclick = () => { paginaAtual++; renderizarTabela(); };
    ctrl.appendChild(next);
}

function abrirModal() {
    modoEdicao = null;
    document.querySelector("#modal-produto .modal-header h3").innerHTML =
        '<i class="bi bi-plus-circle-fill"></i> Novo Produto';
    document.getElementById("formProduto")?.reset();
    carregarCategorias();
    document.getElementById("modal-produto").classList.add("open");
}

function abrirModalEdicao(id) {
    const p = lista.find(x => (x.idProduto ?? x.IdProduto) === id);
    if (!p) return;

    modoEdicao = id;
    document.querySelector("#modal-produto .modal-header h3").innerHTML =
        '<i class="bi bi-pencil-fill"></i> Editar Produto';

    document.getElementById("nome").value = p.nome ?? "";
    document.getElementById("codProduto").value = p.sku ?? p.skuProduto ?? "";
    document.getElementById("codBarras").value = p.codigoBarras ?? "";
    document.getElementById("descricao").value = p.descricao ?? "";
    document.getElementById("precoCusto").value = p.precoCusto ?? p.PrecoCusto ?? "";
    document.getElementById("precoVenda").value = p.precoVenda ?? p.PrecoVenda ?? "";
    document.getElementById("unidade").value = p.unidade ?? "";

    carregarCategorias().then(() => {
        document.getElementById("prod-categoria").value = p.idCategoria ?? "";
    });

    document.getElementById("modal-produto").classList.add("open");
}

function fecharModal() {
    document.getElementById("modal-produto")?.classList.remove("open");
    modoEdicao = null;
}

// Modal fiscal (comentado — funcionalidade desabilitada temporariamente)
/*
function abrirModalFiscal(id) { ... }
function fecharModalFiscal() { ... }
*/

// ── Modal: Confirmar Alteração de Status ──
function abrirModalStatus(id) {
    const p = lista.find(x => (x.idProduto ?? x.IdProduto) === id);
    if (!p) return;

    _idStatusAlvo = id;
    const ativo = p.fAtivo === true || p.fAtivo === 1;
    const acao = ativo ? "Inativar" : "Reativar";
    const cor = ativo ? "#dc2626" : "#15803d";
    const icone = ativo ? "bi-dash-circle-fill" : "bi-check-circle-fill";

    document.getElementById("status-modal-titulo").innerHTML =
        `<i class="bi ${icone}" style="color:${cor}"></i> ${acao} Produto`;
    document.getElementById("status-modal-msg").innerHTML =
        `Deseja <strong>${acao.toLowerCase()}</strong> o produto <strong>"${p.nome}"</strong>?`;

    const btnConfirmar = document.getElementById("btn-confirmar-status");
    btnConfirmar.style.background = cor;
    btnConfirmar.innerHTML = `<i class="bi ${icone}"></i> ${acao}`;

    document.getElementById("modal-status-produto").classList.add("open");
}

function fecharModalStatus() {
    document.getElementById("modal-status-produto")?.classList.remove("open");
    _idStatusAlvo = null;
}

async function confirmarAlterarStatus() {
    if (!_idStatusAlvo) return;
    const p = lista.find(x => (x.idProduto ?? x.IdProduto) === _idStatusAlvo);
    const ativo = p?.fAtivo === true || p?.fAtivo === 1;
    const acao = ativo ? "inativado" : "reativado";

    const btn = document.getElementById("btn-confirmar-status");
    btn.disabled = true;

    try {
        await apiPost("/Produto/AlterarStatus", _idStatusAlvo);
        fecharModalStatus();
        await carregarProdutos();
        flexToast(`Produto ${acao} com sucesso!`, "sucesso");
    } catch (err) {
        flexToast("Erro ao alterar status: " + err.message, "erro");
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-filtro-todos")?.classList.add("ativo-sel");
    carregarProdutos();
    carregarCategorias();

    document.getElementById("btnSalvar")?.addEventListener("click", async function () {
        const nome = document.getElementById("nome")?.value?.trim();
        if (!nome) { flexToast("Nome é obrigatório.", "aviso"); return; }

        const payload = {
            IdProduto: modoEdicao ?? 0,
            Nome: nome,
            SKU: document.getElementById("codProduto")?.value?.trim() || null,
            CodigoBarras: document.getElementById("codBarras")?.value?.trim() || null,
            Descricao: document.getElementById("descricao")?.value?.trim() || null,
            PrecoCusto: Number(document.getElementById("precoCusto")?.value || 0),
            PrecoVenda: Number(document.getElementById("precoVenda")?.value || 0),
            Unidade: document.getElementById("unidade")?.value?.trim() || null,
            IdCategoria: Number(document.getElementById("prod-categoria")?.value) || null,
            FAtivo: true
        };

        this.disabled = true;
        try {
            if (modoEdicao) {
                await apiPost("/Produto/Editar", payload);
                flexToast("Produto atualizado!", "sucesso");
            } else {
                await apiPost("/Produto/Criar", payload);
                flexToast("Produto criado!", "sucesso");
            }
            fecharModal();
            await carregarProdutos();
        } catch (err) {
            flexToast("Erro ao salvar: " + err.message, "erro");
        } finally {
            this.disabled = false;
        }
    });

});