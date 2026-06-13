// ===== EMPRESA.JS — FlexGestor =====

let _ambienteAtual = 2;
let _certArquivo = null;

function flexToast(msg, tipo = "sucesso") {
    const cores = { sucesso: "#15803d", erro: "#dc2626", aviso: "#d97706" };
    const icones = { sucesso: "bi-check-circle-fill", erro: "bi-x-circle-fill", aviso: "bi-exclamation-triangle-fill" };
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;max-width:44rem;`;
    t.innerHTML = `<i class="bi ${icones[tipo]}"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
    setTimeout(() => {
        t.style.opacity = "0"; t.style.transform = "translateY(-1rem)";
        setTimeout(() => t.remove(), 350);
    }, 4000);
}

function setBtnLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn.dataset.orig = btn.innerHTML;
        btn.innerHTML = '<span class="emp-spinner"></span> Salvando...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    }
}

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
        const txt = await res.text();
        let msg = txt;
        try { msg = JSON.parse(txt).mensagem || txt; } catch { }
        throw new Error(msg || `Erro ${res.status}`);
    }
    return res.json().catch(() => null);
}

// ── Abas ──
function mudarAba(aba) {
    document.querySelectorAll(".emp-tab-btn").forEach(b => b.classList.remove("ativo"));
    document.querySelectorAll(".emp-tab-painel").forEach(p => p.classList.remove("ativo"));
    document.getElementById(`tab-btn-${aba}`)?.classList.add("ativo");
    document.getElementById(`tab-${aba}`)?.classList.add("ativo");
}

// ── Carregar dados ──
async function carregarEmpresa() {
    try {
        const data = await apiGet("/Empresa/Buscar");
        const empresa = data.empresa;
        const endereco = data.endereco;

        if (empresa) {
            document.getElementById("emp-nome").value = empresa.nome || "";
            document.getElementById("emp-cnpj").value = empresa.cnpj || "";
            document.getElementById("emp-tel").value = empresa.telefone || "";
            document.getElementById("emp-email").value = empresa.email || "";
            document.getElementById("emp-codmun").value = empresa.codigoMunicipio || "";
            document.getElementById("emp-nome-topo").textContent = empresa.nome || "Empresa";
            document.getElementById("emp-cnpj-topo").textContent = empresa.cnpj
                ? "CNPJ: " + formatarCNPJ(empresa.cnpj) : "";
        }

        if (endereco) {
            document.getElementById("emp-cep").value = endereco.cep || "";
            document.getElementById("emp-logradouro").value = endereco.logradouro || "";
            document.getElementById("emp-numero").value = endereco.numero || "";
            document.getElementById("emp-complemento").value = endereco.complemento || "";
            document.getElementById("emp-bairro").value = endereco.bairro || "";
            document.getElementById("emp-cidade").value = endereco.cidade || "";
            const sel = document.getElementById("emp-estado");
            if (sel && endereco.estado) sel.value = endereco.estado;
        }
    } catch (err) {
        flexToast("Erro ao carregar dados: " + err.message, "erro");
    }
}

// ── Salvar dados ──
async function salvarEmpresa() {
    const btn = document.getElementById("btn-salvar-empresa");
    const dto = {
        Nome: document.getElementById("emp-nome").value.trim(),
        CNPJ: document.getElementById("emp-cnpj").value.replace(/\D/g, ""),
        Telefone: document.getElementById("emp-tel").value.trim() || null,
        Email: document.getElementById("emp-email").value.trim() || null,
        CodigoMunicipio: document.getElementById("emp-codmun").value.trim() || null,
        Logradouro: document.getElementById("emp-logradouro").value.trim(),
        Numero: document.getElementById("emp-numero").value.trim() || null,
        Complemento: document.getElementById("emp-complemento").value.trim() || null,
        Bairro: document.getElementById("emp-bairro").value.trim() || null,
        Cidade: document.getElementById("emp-cidade").value.trim(),
        Estado: document.getElementById("emp-estado").value.trim(),
        CEP: document.getElementById("emp-cep").value.replace(/\D/g, "")
    };

    if (!dto.Nome) { flexToast("O nome da empresa é obrigatório.", "aviso"); return; }
    if (dto.CNPJ.length !== 14) { flexToast("CNPJ inválido.", "aviso"); return; }

    setBtnLoading(btn, true);
    try {
        await apiPost("/Empresa/Salvar", dto);
        document.getElementById("emp-nome-topo").textContent = dto.Nome;
        document.getElementById("emp-cnpj-topo").textContent = "CNPJ: " + formatarCNPJ(dto.CNPJ);
        flexToast("Dados salvos com sucesso!");
    } catch (err) {
        flexToast(err.message, "erro");
    } finally {
        setBtnLoading(btn, false);
    }
}

// ── CEP / ViaCEP ──
async function buscarCEP() {
    const cep = document.getElementById("emp-cep").value.replace(/\D/g, "");
    if (cep.length !== 8) { flexToast("CEP inválido.", "aviso"); return; }

    const btn = document.getElementById("btn-buscar-cep");
    btn.disabled = true;
    btn.innerHTML = '<span class="emp-spinner"></span>';

    try {
        const data = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json());
        if (data.erro) { flexToast("CEP não encontrado.", "aviso"); return; }
        document.getElementById("emp-logradouro").value = data.logradouro || "";
        document.getElementById("emp-bairro").value = data.bairro || "";
        document.getElementById("emp-cidade").value = data.localidade || "";
        const sel = document.getElementById("emp-estado");
        if (sel && data.uf) sel.value = data.uf;
        document.getElementById("emp-numero").focus();
    } catch {
        flexToast("Erro ao consultar o CEP.", "erro");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-search"></i> Buscar';
    }
}

function formatarCNPJ(cnpj) {
    return cnpj.replace(/\D/g, "")
        .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

// ── Configuração Fiscal (desabilitada temporariamente) ──
// function carregarFiscal() { ... }
// function salvarFiscal() { ... }
// function setAmbiente(valor) { ... }
// function confirmarAmbienteProd() { ... }
// function fecharModalProd() { ... }
// function confirmarProd() { ... }
// function renderCertStatus(tem, dthVenc) { ... }
// function selecionarCert(file) { ... }
// function salvarCertificado() { ... }

document.addEventListener("DOMContentLoaded", () => {
    // Máscaras
    document.getElementById("emp-cep")?.addEventListener("input", function () {
        let v = this.value.replace(/\D/g, "").slice(0, 8);
        if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
        this.value = v;
    });
    document.getElementById("emp-cep")?.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); buscarCEP(); }
    });
    document.getElementById("emp-cnpj")?.addEventListener("input", function () {
        let v = this.value.replace(/\D/g, "").slice(0, 14);
        v = v.replace(/^(\d{2})(\d)/, "$1.$2")
            .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1/$2")
            .replace(/(\d{4})(\d)/, "$1-$2");
        this.value = v;
    });
    document.getElementById("emp-tel")?.addEventListener("input", function () {
        let v = this.value.replace(/\D/g, "").slice(0, 11);
        if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
        else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d*)$/, "($1) $2-$3");
        else if (v.length > 2) v = v.replace(/^(\d{2})(\d*)$/, "($1) $2");
        this.value = v;
    });

    // Abas
    document.querySelectorAll(".emp-tab-btn").forEach(btn => {
        btn.addEventListener("click", function () { mudarAba(this.dataset.aba); });
    });

    document.getElementById("btn-buscar-cep")?.addEventListener("click", buscarCEP);
    document.getElementById("btn-salvar-empresa")?.addEventListener("click", salvarEmpresa);

    carregarEmpresa();
    // carregarFiscal(); // desabilitado temporariamente
});