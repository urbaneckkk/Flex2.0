// Constante que define quantos usuários serão exibidos por página na listagem
const USUARIOS_POR_PAGINA = 10;

// Controle de paginação atual da tabela
let paginaAtual = 1;

// Lista já filtrada (resultado dos filtros aplicados)
let usuariosFiltrados = [];

// Lista completa de usuários carregados da API
let todoUsuarios = [];

// Usuário atualmente sendo editado no modal de edição
let usuarioEmEdicao = null;

// Usuário selecionado para ativar/inativar
let usuarioParaAlterarStatus = null;

// Filtro de status selecionado (todos, ativo ou inativo)
let filtroStatus = "todos";

// Texto digitado no campo de busca
let filtroTexto = "";

// Tipo de filtro (por nome ou CPF)
let filtroTipo = "nome";

// Função responsável por capturar o token antifalsificação (CSRF)
// Ele é necessário para requisições seguras no backend (principalmente ASP.NET)
function getCsrfToken() {
    return document.querySelector('input[name="__RequestVerificationToken"]')?.value ?? "";
}

// Função genérica para requisições GET
// Centraliza o fetch e já trata erro de HTTP
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}

// Função genérica para requisições POST enviando JSON
// Também já injeta o token CSRF no header
// E tenta extrair mensagem de erro vinda do backend
async function apiPost(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "RequestVerificationToken": getCsrfToken()
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        let mensagem = "Erro ao processar.";

        const texto = await res.text();

        try {
            const data = JSON.parse(texto);
            mensagem = data.mensagem || data.title || texto || mensagem;
        } catch {
            mensagem = texto || mensagem;
        }

        throw new Error(mensagem);
    }

    return res;
}

// POST alternativo usando form-urlencoded
// Usado em endpoints que não aceitam JSON diretamente
async function apiPostForm(url, params) {
    const form = new URLSearchParams(params);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "RequestVerificationToken": getCsrfToken()
        },
        body: form.toString()
    });

    if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
    return res;
}

// Função principal que busca todos os usuários no backend
// Depois normaliza os dados (evita null e padroniza campos)
async function carregarUsuarios() {
    try {
        const data = await apiGet("/Usuario/Listar");

        todoUsuarios = data.map(u => ({
            idUsuario: u.idUsuario,
            login: u.login,
            nome: u.nome,
            cpf: u.cpf ?? "",
            email: u.email ?? "",
            telefone: u.telefone ?? "",
            cargo_id: u.cargo_id,
            dthCriacao: u.dthCriacao,
            fAtivo: u.fAtivo
        }));

        aplicarFiltros();
    } catch (err) {
        flexToast("Não foi possível carregar os usuários: " + err.message, "erro");
    }
}

// Carrega lista de cargos para popular selects de perfil
async function carregarCargos(selectId) {
    try {
        const cargos = await apiGet("/Usuario/ListarCargos");

        const sel = document.getElementById(selectId);
        sel.innerHTML = "";

        cargos.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.idCargo;
            opt.textContent = c.nome ?? c.Nome;
            sel.appendChild(opt);
        });

    } catch (err) {
        flexToast("Não foi possível carregar os cargos.", "aviso");
    }
}

// Aplica filtros combinando status, texto e tipo de busca
// Essa função é o "coração" da filtragem da tabela
function aplicarFiltros() {
    usuariosFiltrados = todoUsuarios.filter(u => {

        // Filtra por status ativo/inativo
        if (filtroStatus === "ativo" && !u.fAtivo) return false;
        if (filtroStatus === "inativo" && u.fAtivo) return false;

        // Se há texto de filtro, aplica busca dinâmica
        if (filtroTexto) {

            // Define qual campo será pesquisado
            const campo = filtroTipo === "nome"
                ? u.nome.toLowerCase()
                : (u.cpf ?? "").replace(/\D/g, "");

            const termo = filtroTipo === "nome"
                ? filtroTexto.toLowerCase()
                : filtroTexto.replace(/\D/g, "");

            if (!campo.includes(termo)) return false;
        }

        return true;
    });

    paginaAtual = 1;
    renderizarTabela();
}

// Captura valores da UI e dispara filtro
function filtrarTabela() {
    filtroTipo = document.getElementById("select-tipo-filtro").value;
    filtroTexto = document.getElementById("input-termo-busca").value.trim();
    aplicarFiltros();
}

// Define filtro por status e atualiza UI dos botões
function setFiltroStatus(valor) {
    filtroStatus = valor;

    document.querySelectorAll(".btn-status-filtro").forEach(btn =>
        btn.classList.remove("ativo-sel", "ativo-on", "ativo-off"));

    const mapa = { todos: "ativo-sel", ativo: "ativo-on", inativo: "ativo-off" };

    document.getElementById(`btn-filtro-${valor}`).classList.add(mapa[valor]);

    aplicarFiltros();
}

// Renderiza a tabela com paginação aplicada
function renderizarTabela() {
    const tbody = document.querySelector("#tabela-usuarios tbody");

    const inicio = (paginaAtual - 1) * USUARIOS_POR_PAGINA;

    const pagina = usuariosFiltrados.slice(inicio, inicio + USUARIOS_POR_PAGINA);

    // Caso não haja dados
    if (pagina.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum usuário encontrado.</td></tr>`;
    } else {
        // Monta HTML da tabela
        tbody.innerHTML = pagina.map(u => `
            <tr>
                <td class="area-acoes">
                    <button class="btn-acao btn-editar" onclick="abrirModalEdicao(${u.idUsuario})">
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                    <button class="btn-acao ${u.fAtivo ? 'btn-inativar' : 'btn-reativar'}"
                        onclick="confirmarAlterarStatus(${u.idUsuario})">
                        <i class="bi bi-${u.fAtivo ? 'person-dash-fill' : 'person-check-fill'}"></i>
                    </button>
                </td>
                <td><span class="status-pill status-${u.fAtivo ? 'ativo' : 'inativo'}">${u.fAtivo ? 'Ativo' : 'Inativo'}</span></td>
                <td>${u.nome}</td>
<td>${formatarCPF(u.cpf)}</td>
                <td>${u.login}</td>
                <td>${u.email || "—"}</td>
<td>${formatarTelefone(u.telefone)}</td>
            </tr>
        `).join("");
    }

    renderizarPaginacao();
}

// Monta controle de paginação inferior
function renderizarPaginacao() {
    const total = usuariosFiltrados.length;
    const totalPaginas = Math.ceil(total / USUARIOS_POR_PAGINA);

    const inicio = total === 0 ? 0 : (paginaAtual - 1) * USUARIOS_POR_PAGINA + 1;
    const fim = Math.min(paginaAtual * USUARIOS_POR_PAGINA, total);

    document.querySelector(".paginacao-info").textContent =
        total === 0 ? "Nenhum registro" : `Mostrando ${inicio}–${fim} de ${total} usuários`;

    const controles = document.querySelector(".paginacao-controles");
    controles.innerHTML = "";

    // Botão anterior
    controles.appendChild(criarBtnPagina("‹", paginaAtual === 1,
        () => { paginaAtual--; renderizarTabela(); }));

    // Botões numerados
    for (let i = 1; i <= totalPaginas; i++) {
        const btn = criarBtnPagina(i, false, () => {
            paginaAtual = i;
            renderizarTabela();
        });

        if (i === paginaAtual) btn.classList.add("ativo");
        controles.appendChild(btn);
    }

    // Botão próximo
    controles.appendChild(criarBtnPagina("›", paginaAtual === totalPaginas,
        () => { paginaAtual++; renderizarTabela(); }));
}

// Cria botão reutilizável de paginação
function criarBtnPagina(label, disabled, onClick) {
    const btn = document.createElement("button");
    btn.className = "btn-pagina";
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener("click", onClick);
    return btn;
}


// Controla estado de loading dos botões
function setBotaoCarregando(btnEl, carregando) {
    if (carregando) {
        btnEl.disabled = true;
        btnEl.dataset.textoOriginal = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="bi bi-hourglass-split"></i> Salvando...';
    } else {
        btnEl.disabled = false;
        btnEl.innerHTML = btnEl.dataset.textoOriginal;
    }
}

// ── Modais ────────────────────────────────
function abrirModal() {
    document.getElementById("form-usuario").reset();
    document.getElementById("novo-perfil").innerHTML = '<option value="">Carregando...</option>';
    carregarCargos("novo-perfil");
    document.getElementById("modal-novo-usuario").classList.add("open");
}

function fecharModal() {
    document.getElementById("modal-novo-usuario").classList.remove("open");
}

function abrirModalEdicao(id) {
    usuarioEmEdicao = todoUsuarios.find(u => u.idUsuario === id);
    if (!usuarioEmEdicao) return;

    const u = usuarioEmEdicao;
    document.getElementById("edit-nome").value = u.nome ?? "";
    document.getElementById("edit-login").value = u.login ?? "";
    document.getElementById("edit-cpf").value = formatarCPF(u.cpf);
    document.getElementById("edit-email").value = u.email ?? "";
    document.getElementById("edit-telefone").value = formatarTelefone(u.telefone);
    document.getElementById("edit-senha").value = "";
    document.getElementById("edit-criacao").value = u.dthCriacao
        ? new Date(u.dthCriacao).toLocaleDateString("pt-BR") : "";

    carregarCargos("edit-perfil").then(() => {
        document.getElementById("edit-perfil").value = u.cargo_id ?? "";
    });

    document.getElementById("modal-edicao").classList.add("open");
}

function fecharModalEdicao() {
    document.getElementById("modal-edicao").classList.remove("open");
    usuarioEmEdicao = null;
}

function confirmarAlterarStatus(id) {
    usuarioParaAlterarStatus = todoUsuarios.find(u => u.idUsuario === id);
    if (!usuarioParaAlterarStatus) return;

    const acao = usuarioParaAlterarStatus.fAtivo ? "inativar" : "reativar";
    document.getElementById("confirm-mensagem").innerHTML =
        `Deseja <strong>${acao}</strong> o usuário <strong>${usuarioParaAlterarStatus.nome}</strong>?`;
    document.getElementById("confirm-btn-sim").textContent = `Sim, ${acao}`;
    document.getElementById("modal-confirmar").classList.add("open");
}

function fecharModalConfirmar() {
    document.getElementById("modal-confirmar").classList.remove("open");
    usuarioParaAlterarStatus = null;
}

// ── Submits ───────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    carregarUsuarios();
    document.getElementById("btn-filtro-todos").classList.add("ativo-sel");

    document.getElementById("input-termo-busca")
        ?.addEventListener("input", filtrarTabela);
    document.getElementById("select-tipo-filtro")
        ?.addEventListener("change", filtrarTabela);

    aplicarMascaraCPF(document.getElementById("novo-cpf"));
    aplicarMascaraTelefone(document.getElementById("novo-telefone"));
    aplicarMascaraCPF(document.getElementById("edit-cpf"));
    aplicarMascaraTelefone(document.getElementById("edit-telefone"));

    // Submit novo usuário
    document.getElementById("form-usuario")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = this.querySelector('[type="submit"]');
        setBotaoCarregando(btn, true);
        try {
            await apiPost("/Usuario/Criar", {
                Nome: document.getElementById("novo-nome").value.trim(),
                Login: document.getElementById("novo-login").value.trim(),
                Senha: document.getElementById("novo-senha").value,
                CPF: document.getElementById("novo-cpf").value.replace(/\D/g, ""),
                Email: document.getElementById("novo-email").value.trim() || null,
                Telefone: document.getElementById("novo-telefone").value.replace(/\D/g, "") || null,
                cargo_id: parseInt(document.getElementById("novo-perfil").value)
            });
            fecharModal();
            flexToast("Usuário criado com sucesso!", "sucesso");
            await carregarUsuarios();
        } catch (err) {
            flexToast(err.message, "erro");
        } finally {
            setBotaoCarregando(btn, false);
        }
    });

    // Submit edição
    document.getElementById("form-edicao")?.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!usuarioEmEdicao) return;
        const btn = this.querySelector('[type="submit"]');
        setBotaoCarregando(btn, true);
        try {
            await apiPost("/Usuario/Editar", {
                IdUsuario: usuarioEmEdicao.idUsuario,
                Nome: document.getElementById("edit-nome").value.trim(),
                Login: document.getElementById("edit-login").value.trim(),
                Senha: document.getElementById("edit-senha").value || null,
                CPF: document.getElementById("edit-cpf").value.replace(/\D/g, ""),
                Email: document.getElementById("edit-email").value.trim() || null,
                Telefone: document.getElementById("edit-telefone").value.replace(/\D/g, "") || null,
                cargo_id: parseInt(document.getElementById("edit-perfil").value)
            });
            fecharModalEdicao();
            flexToast("Usuário atualizado!", "sucesso");
            await carregarUsuarios();
        } catch (err) {
            flexToast(err.message, "erro");
        } finally {
            setBotaoCarregando(btn, false);
        }
    });

    // Confirmar alterar status
    document.getElementById("confirm-btn-sim")?.addEventListener("click", async function () {
        if (!usuarioParaAlterarStatus) return;
        try {
            await apiPostForm("/Usuario/AlterarStatus", { id: usuarioParaAlterarStatus.idUsuario });
            fecharModalConfirmar();
            flexToast("Status alterado!", "sucesso");
            await carregarUsuarios();
        } catch (err) {
            flexToast(err.message, "erro");
        }
    });
});