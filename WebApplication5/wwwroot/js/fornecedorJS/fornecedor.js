let fornecedores = [];
let filtrado = [];
let fornecedorEdicao = null;
let fornecedorAcao = null;
let filtroStatus = "todos";

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
        let msg = txt;
        try { msg = JSON.parse(txt).mensagem ?? txt; } catch { }
        throw new Error(msg || `POST ${url} → ${res.status}`);
    }
    return res;
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

async function carregarFornecedores() {
    try {
        fornecedores = await apiGet("/Fornecedor/Listar");
        aplicarFiltros();
    } catch (err) {
        flexToast("Erro ao carregar fornecedores.", "erro");
    }
}

function filtrar() { aplicarFiltros(); }

function aplicarFiltros() {
    const termo = document.getElementById("input-busca")?.value.toLowerCase() || "";
    filtrado = fornecedores.filter(f => {
        if (filtroStatus === "ativo" && !f.fAtivo) return false;
        if (filtroStatus === "inativo" && f.fAtivo) return false;
        if (termo && !f.nomeFantasia?.toLowerCase().includes(termo) &&
            !f.cnpj?.includes(termo)) return false;
        return true;
    });
    renderizarTabela();
}

function setFiltroStatus(valor) {
    filtroStatus = valor;
    document.querySelectorAll(".btn-status-filtro").forEach(b =>
        b.classList.remove("sel-todos", "sel-ativo", "sel-inativo"));
    document.getElementById(`btn-filtro-${valor}`).classList.add(`sel-${valor}`);
    aplicarFiltros();
}

function renderizarTabela() {
    const tbody = document.getElementById("tbody-fornecedor");
    if (!filtrado.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum fornecedor encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = filtrado.map(f => `
        <tr>
            <td class="area-acoes">
                <button class="btn-acao btn-editar" onclick="abrirModalEdicao(${f.idFornecedor})">
                    <i class="bi bi-pencil-fill"></i>
                </button>
                <button class="btn-acao ${f.fAtivo ? 'btn-inativar' : 'btn-reativar'}"
                    onclick="confirmarAcao(${f.idFornecedor})">
                    <i class="bi bi-${f.fAtivo ? 'trash3-fill' : 'arrow-counterclockwise'}"></i>
                </button>
            </td>
            <td><span class="status-pill ${f.fAtivo ? 'status-normal' : 'status-critico'}">
                ${f.fAtivo ? 'Ativo' : 'Inativo'}</span></td>
            <td>${f.nomeFantasia}</td>
            <td>${f.razaoSocial || '—'}</td>
            <td>${formatarCNPJ(f.cnpj)}</td>
            <td>${formatarTelefone(f.telefone)}</td>
            <td>${f.email || '—'}</td>
        </tr>`).join("");
}

function abrirModal() {
    fornecedorEdicao = null;
    document.getElementById("formFornecedor").reset();
    document.querySelector("#modalFornecedor .modal-header h3").textContent = "Novo Fornecedor";
    document.getElementById("modalFornecedor").classList.add("open");
}

function fecharModal() {
    document.getElementById("modalFornecedor").classList.remove("open");
}

function abrirModalEdicao(id) {
    fornecedorEdicao = fornecedores.find(f => f.idFornecedor === id);
    if (!fornecedorEdicao) return;

    document.querySelector("#modalFornecedor .modal-header h3").textContent = "Editar Fornecedor";
    document.getElementById("nomeFantasia").value = fornecedorEdicao.nomeFantasia || "";
    document.getElementById("razaoSocial").value = fornecedorEdicao.razaoSocial || "";
    document.getElementById("cnpj").value = formatarCNPJ(fornecedorEdicao.cnpj);
    document.getElementById("telefone").value = formatarTelefone(fornecedorEdicao.telefone);
    document.getElementById("email").value = fornecedorEdicao.email || "";
    document.getElementById("modalFornecedor").classList.add("open");
}

document.getElementById("formFornecedor").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btnSalvar = this.querySelector('[type="submit"]');
    btnSalvar.disabled = true;

    const payload = {
        IdFornecedor: fornecedorEdicao?.idFornecedor || 0,
        NomeFantasia: document.getElementById("nomeFantasia").value.trim(),
        RazaoSocial: document.getElementById("razaoSocial").value.trim() || null,
        CNPJ: document.getElementById("cnpj").value.replace(/\D/g, ""),
        Telefone: document.getElementById("telefone").value.replace(/\D/g, ""),
        Email: document.getElementById("email").value.trim() || null
    };

    try {
        if (fornecedorEdicao) {
            await apiPost("/Fornecedor/Editar", payload);
            flexToast("Fornecedor atualizado!", "sucesso");
        } else {
            await apiPost("/Fornecedor/Criar", payload);
            flexToast("Fornecedor cadastrado!", "sucesso");
        }
        fecharModal();
        await carregarFornecedores();
    } catch (err) {
        flexToast(err.message, "erro");
    } finally {
        btnSalvar.disabled = false;
    }
});

function confirmarAcao(id) {
    fornecedorAcao = fornecedores.find(f => f.idFornecedor === id);
    if (!fornecedorAcao) return;
    const acao = fornecedorAcao.fAtivo ? "inativar" : "reativar";
    document.getElementById("confirmMensagem").innerHTML =
        `Deseja <strong>${acao}</strong> o fornecedor <strong>${fornecedorAcao.nomeFantasia}</strong>?`;
    document.getElementById("modalConfirmar").classList.add("open");
}

function fecharModalConfirmar() {
    document.getElementById("modalConfirmar").classList.remove("open");
    fornecedorAcao = null;
}

document.getElementById("btnConfirmar").addEventListener("click", async function () {
    if (!fornecedorAcao) return;
    this.disabled = true;
    try {
        await apiPost("/Fornecedor/AlterarStatus", fornecedorAcao.idFornecedor);
        flexToast(`Fornecedor ${fornecedorAcao.fAtivo ? "inativado" : "reativado"}!`, "sucesso");
        fecharModalConfirmar();
        await carregarFornecedores();
    } catch (err) {
        flexToast(err.message, "erro");
    } finally {
        this.disabled = false;
    }
});

document.getElementById("btn-filtro-todos").classList.add("sel-todos");

document.addEventListener("DOMContentLoaded", () => {
    aplicarMascaraCNPJ(document.getElementById("cnpj"));
    aplicarMascaraTelefone(document.getElementById("telefone"));
    carregarFornecedores();
});