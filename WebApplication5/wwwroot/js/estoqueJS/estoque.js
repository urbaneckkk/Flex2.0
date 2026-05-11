// Lista principal com todos os itens de estoque vindos do backend
let lista = [];

// Lista derivada usada para exibição após aplicação de filtros
let listaFiltrada = [];

// Texto digitado pelo usuário para busca
let filtroTexto = "";

// Filtro de status (todos | critico | normal | excesso)
let filtroStatus = "todos";

// Lista de fornecedores carregados do backend
let fornecedores = [];

// Lista base de produtos ativos que podem ser inseridos no estoque
let produtosBase = [];

// Guarda o fornecedor selecionado nos fluxos (wizard/configuração)
let fornecedorSelecionado = null;

// Guarda o produto selecionado no fluxo de inserção
let produtoSelecionado = null;

// Controla em qual etapa o usuário está no wizard de inserção
let etapaInserir = 1;

// Total de etapas do wizard de inserção
const TOTAL_ETAPAS = 4;

// Controle da etapa atual do modal de configuração de estoque
let cfgEtapa = 1;

// Total de etapas do modal de configuração (2 etapas)
const CFG_TOTAL_ETAPAS = 2;

// Fornecedor selecionado especificamente no modal de configuração
let cfgFornecedorSelecionado = null;


// Função genérica para requisições GET
// Faz chamada HTTP e retorna JSON ou lança erro com status
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}


// Função genérica para requisições POST
// Envia body como JSON e trata erro retornando mensagem do backend quando possível
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

    return res;
}


// Componente visual de feedback (toast)
// Cria dinamicamente um elemento na tela com cor e ícone baseado no tipo
function flexToast(msg, tipo = "sucesso") {
    const cores = {
        sucesso: "#15803d",
        erro: "#dc2626",
        aviso: "#d97706"
    };

    const icones = {
        sucesso: "bi-check-circle-fill",
        erro: "bi-x-circle-fill",
        aviso: "bi-exclamation-triangle-fill"
    };

    const t = document.createElement("div");

    // Estilo inline aplicado diretamente no elemento criado
    t.style.cssText = `
        position:fixed;
        top:2rem;
        right:2rem;
        background:${cores[tipo]};
        color:#fff;
        padding:1.2rem 1.8rem;
        border-radius:.8rem;
        font-size:1.4rem;
        font-family:'Segoe UI',sans-serif;
        display:flex;
        align-items:center;
        gap:.8rem;
        box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;
        opacity:0;
        transform:translateY(-1rem);
        transition:all .3s ease;
        max-width:36rem;
    `;

    // Conteúdo interno com ícone + mensagem
    t.innerHTML = `<i class="bi ${icones[tipo]}"></i><span>${msg}</span>`;

    document.body.appendChild(t);

    // Animação de entrada
    requestAnimationFrame(() => {
        t.style.opacity = "1";
        t.style.transform = "translateY(0)";
    });

    // Remove automaticamente após 3.2s
    setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateY(-1rem)";
        setTimeout(() => t.remove(), 350);
    }, 3200);
}


// Formata datas para padrão brasileiro
// Caso não exista data, retorna placeholder
function formatarData(data) {
    if (!data) return "—";
    return new Date(data).toLocaleDateString("pt-BR");
}


// Carrega os dados de estoque do backend
// Após carregar, aplica os filtros automaticamente
async function carregarEstoque() {
    try {
        lista = await apiGet("/Estoque/Listar");
        aplicarFiltros();
    } catch (err) {
        flexToast("Erro ao carregar estoque: " + err.message, "erro");
    }
}


// Carrega apenas produtos ativos (usados no wizard de inserção)
async function carregarProdutosBase() {
    try {
        const todos = await apiGet("/Produto/Listar");

        // Mantém apenas produtos ativos (true ou 1)
        produtosBase = todos.filter(p => p.fAtivo === true || p.fAtivo === 1);
    } catch {
        produtosBase = [];
    }
}


// Carrega lista de fornecedores
async function carregarFornecedores() {
    try {
        fornecedores = await apiGet("/Fornecedor/Listar");
    } catch {
        fornecedores = [];
    }
}


// Determina o status do item com base na quantidade atual e limites
function classificarStatus(item) {
    const qtd = item.quantidade ?? 0;
    const min = item.estoqueMinimo ?? 0;
    const max = item.estoqueMax ?? 0;

    // Abaixo ou igual ao mínimo → crítico
    if (qtd <= min) return "critico";

    // Acima do máximo (quando definido) → excesso
    if (max > 0 && qtd > max) return "excesso";

    // Caso contrário → normal
    return "normal";
}


// Define o filtro de status selecionado na UI
function setFiltroStatus(valor) {
    filtroStatus = valor;

    // Remove classes visuais de todos os botões
    document.querySelectorAll(".btn-status-filtro").forEach(b =>
        b.classList.remove("sel-todos", "sel-critico", "sel-normal", "sel-excesso")
    );

    // Aplica classe ao botão selecionado
    document.getElementById(`btn-filtro-${valor}`)?.classList.add(`sel-${valor}`);

    aplicarFiltros();
}


// Atualiza o texto de busca e reaplica filtros
function filtrarTabela() {
    filtroTexto = document.getElementById("input-termo-busca")?.value ?? "";
    aplicarFiltros();
}


// Aplica filtros de status + texto sobre a lista original
function aplicarFiltros() {
    const termo = filtroTexto.toLowerCase();

    listaFiltrada = lista.filter(item => {
        const status = classificarStatus(item);

        // Filtra por status se não for "todos"
        if (filtroStatus !== "todos" && status !== filtroStatus) return false;

        // Filtra por nome do produto
        if (termo && !(item.nomeProduto ?? "").toLowerCase().includes(termo)) return false;

        return true;
    });

    renderizarTabela();
}


// Renderiza a tabela HTML com os itens filtrados
function renderizarTabela() {
    const tbody = document.querySelector("#tabela-estoque tbody");

    if (!tbody) return;

    // Caso não tenha dados, mostra estado vazio
    if (!listaFiltrada.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Nenhum item encontrado.</td></tr>`;
        return;
    }

    // Monta HTML linha a linha
    tbody.innerHTML = listaFiltrada.map(item => {
        const status = classificarStatus(item);

        const labelSt = {
            critico: "Crítico",
            normal: "Normal",
            excesso: "Excesso"
        }[status];

        const classSt = `status-${status}`;

        const qtd = item.quantidade ?? 0;

        // Classe visual da quantidade baseada no status
        const qtdClass =
            status === "critico" ? "qtde-critica" :
                status === "excesso" ? "qtde-excesso" :
                    "qtde-normal";

        // Sanitiza strings para evitar quebra de HTML
        const nome = (item.nomeProduto ?? "").replace(/'/g, "&#39;");
        const local = (item.local ?? "").replace(/'/g, "&#39;");

        const min = item.estoqueMinimo ?? 0;
        const max = item.estoqueMax ?? 0;

        return `
        <tr>
            <td class="area-acoes">
                <button class="btn-acao btn-editar"
                    onclick="abrirModalMovimentacao(${item.idProduto}, '${nome}')">
                    <i class="bi bi-arrow-left-right"></i>
                </button>

                <button class="btn-acao"
                    onclick="abrirModalConfiguracao(${item.idProduto}, '${nome}', ${min}, ${max}, '${local}')">
                    <i class="bi bi-bar-chart-fill"></i>
                </button>
            </td>

            <td><span class="status-pill ${classSt}">${labelSt}</span></td>

            <td title="${item.nomeProduto}">${item.nomeProduto}</td>

            <td><strong class="${qtdClass}">${qtd}</strong></td>

            <td>${min}</td>

            <td>${max > 0 ? max : "—"}</td>

            <td>${item.skuProduto || "—"}</td>

            <td>${item.nomeCategoria || "—"}</td>

            <td>${formatarData(item.dthUltimaAtualizacao)}</td>
        </tr>`;
    }).join("");
}

// ── Modal: Inserir no Estoque (Wizard 4 etapas) ───────────────────────────

function abrirModalInserir() {
    etapaInserir = 1;
    produtoSelecionado = null;
    fornecedorSelecionado = null;
    document.getElementById("ins-busca-produto").value = "";
    document.getElementById("ins-qtd").value = "";
    document.getElementById("ins-min").value = "";
    document.getElementById("ins-max").value = "";
    document.getElementById("ins-local").value = "";
    document.getElementById("ins-busca-fornecedor").value = "";
    document.getElementById("ins-preco-compra").value = "";
    document.getElementById("ins-painel-preco").style.display = "none";
    document.getElementById("mensagemErro").style.display = "none";
    irParaEtapaInserir(1);
    carregarProdutosBase().then(() => renderizarListaProdutos(""));
    carregarFornecedores().then(() => renderizarListaFornecedores(""));
    document.getElementById("modal-inserir").classList.add("open");
}

function fecharModalInserir() {
    document.getElementById("modal-inserir").classList.remove("open");
}

function irParaEtapaInserir(etapa) {
    etapaInserir = etapa;
    for (let i = 1; i <= TOTAL_ETAPAS; i++) {
        document.getElementById(`ins-etapa-${i}`)?.classList.toggle("ativa", i === etapa);
        const step = document.querySelectorAll(".stepper .step")[i - 1];
        if (step) step.classList.toggle("active", i === etapa);
    }
    document.getElementById("ins-btn-voltar").style.display = etapa > 1 ? "" : "none";
    document.getElementById("ins-btn-proximo").style.display = etapa < TOTAL_ETAPAS ? "" : "none";
    document.getElementById("ins-btn-salvar").style.display = etapa === TOTAL_ETAPAS ? "" : "none";

    if (etapa === TOTAL_ETAPAS) preencherResumoInserir();
}

function renderizarListaProdutos(termo) {
    const lista_el = document.getElementById("ins-lista-produtos");
    const filtrados = produtosBase.filter(p =>
        !termo || (p.nome ?? "").toLowerCase().includes(termo.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(termo.toLowerCase())
    );
    if (!filtrados.length) {
        lista_el.innerHTML = `<div class="wizard-vazio"><i class="bi bi-box-seam"></i>Nenhum produto encontrado.</div>`;
        return;
    }
    lista_el.innerHTML = filtrados.map(p => `
        <div class="wizard-item${produtoSelecionado?.idProduto === p.idProduto ? " selecionado" : ""}"
             onclick="selecionarProdutoInserir(${p.idProduto})">
            <i class="bi bi-check-circle-fill wizard-item-check"></i>
            <div class="wizard-item-info">
                <div class="wizard-item-nome">${p.nome}</div>
                <div class="wizard-item-sub">SKU: ${p.sku ?? "—"}</div>
            </div>
        </div>`).join("");
}

function selecionarProdutoInserir(id) {
    produtoSelecionado = produtosBase.find(p => p.idProduto === id);
    renderizarListaProdutos(document.getElementById("ins-busca-produto").value);
}

function renderizarListaFornecedores(termo, containerId = "ins-lista-fornecedores", selecionado = null) {
    const lista_el = document.getElementById(containerId);
    const filtrados = fornecedores.filter(f =>
        !termo || (f.nomeFantasia ?? "").toLowerCase().includes(termo.toLowerCase()) ||
        (f.cnpj ?? "").includes(termo)
    );
    if (!filtrados.length) {
        lista_el.innerHTML = `<div class="wizard-vazio"><i class="bi bi-building"></i>Nenhum fornecedor encontrado.</div>`;
        return;
    }
    const prefixo = containerId === "cfg-lista-fornecedores" ? "cfg" : "ins";
    lista_el.innerHTML = filtrados.map(f => `
        <div class="wizard-item${selecionado?.idFornecedor === f.idFornecedor ? " selecionado" : ""}"
             onclick="selecionarFornecedor(${f.idFornecedor}, '${prefixo}')">
            <i class="bi bi-check-circle-fill wizard-item-check"></i>
            <div class="wizard-item-info">
                <div class="wizard-item-nome">${f.nomeFantasia}</div>
                <div class="wizard-item-sub">CNPJ: ${f.cnpj ?? "—"}</div>
            </div>
        </div>`).join("");
}

function selecionarFornecedor(id, prefixo = "ins") {
    const forn = fornecedores.find(f => f.idFornecedor === id);
    if (prefixo === "ins") {
        fornecedorSelecionado = forn;
        document.getElementById("ins-painel-preco").style.display = forn ? "" : "none";
        renderizarListaFornecedores(document.getElementById("ins-busca-fornecedor").value, "ins-lista-fornecedores", fornecedorSelecionado);
    } else {
        cfgFornecedorSelecionado = forn;
        document.getElementById("cfg-painel-preco").style.display = forn ? "" : "none";
        renderizarListaFornecedores(document.getElementById("cfg-busca-fornecedor").value, "cfg-lista-fornecedores", cfgFornecedorSelecionado);
    }
}

function preencherResumoInserir() {
    document.getElementById("ins-resumo-produto").textContent = produtoSelecionado?.nome ?? "—";
    document.getElementById("ins-resumo-sku").textContent = produtoSelecionado?.sku ?? "—";
    document.getElementById("ins-resumo-qtd").textContent = document.getElementById("ins-qtd").value || "0";
    document.getElementById("ins-resumo-min").textContent = document.getElementById("ins-min").value || "0";
    document.getElementById("ins-resumo-max").textContent = document.getElementById("ins-max").value || "0";
    document.getElementById("ins-resumo-local").textContent = document.getElementById("ins-local").value || "—";
    const blocoForn = document.getElementById("ins-resumo-bloco-forn");
    if (fornecedorSelecionado) {
        blocoForn.style.display = "";
        document.getElementById("ins-resumo-fornecedor").textContent = fornecedorSelecionado.nomeFantasia;
        document.getElementById("ins-resumo-preco-compra").textContent =
            `R$ ${parseFloat(document.getElementById("ins-preco-compra").value || 0).toFixed(2)}`;
    } else {
        blocoForn.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-filtro-todos").classList.add("sel-todos");
    carregarEstoque();

    // Busca produto no wizard
    document.getElementById("ins-busca-produto")?.addEventListener("input", function () {
        renderizarListaProdutos(this.value);
    });

    // Busca fornecedor no wizard de inserção
    document.getElementById("ins-busca-fornecedor")?.addEventListener("input", function () {
        renderizarListaFornecedores(this.value, "ins-lista-fornecedores", fornecedorSelecionado);
    });

    // Busca fornecedor no modal de configuração
    document.getElementById("cfg-busca-fornecedor")?.addEventListener("input", function () {
        renderizarListaFornecedores(this.value, "cfg-lista-fornecedores", cfgFornecedorSelecionado);
    });

    // Botão próximo no wizard de inserção
    document.getElementById("ins-btn-proximo")?.addEventListener("click", () => {
        const err = document.getElementById("mensagemErro");
        err.style.display = "none";
        if (etapaInserir === 1 && !produtoSelecionado) {
            err.textContent = "Selecione um produto antes de continuar.";
            err.style.display = "";
            return;
        }
        if (etapaInserir === 2) {
            const qtd = parseInt(document.getElementById("ins-qtd").value);
            if (isNaN(qtd) || qtd < 0) {
                err.textContent = "Informe uma quantidade válida.";
                err.style.display = "";
                return;
            }
        }
        irParaEtapaInserir(etapaInserir + 1);
    });

    // Botão voltar no wizard de inserção
    document.getElementById("ins-btn-voltar")?.addEventListener("click", () => {
        irParaEtapaInserir(etapaInserir - 1);
    });

    // Botão salvar no wizard
    document.getElementById("ins-btn-salvar")?.addEventListener("click", salvarInsercao);

    // Fechar modais ao clicar fora
    ["modal-inserir", "modal-movimentacao", "modal-configuracao"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", function (e) {
            if (e.target === this) {
                if (id === "modal-inserir") fecharModalInserir();
                else if (id === "modal-movimentacao") fecharModalMovimentacao();
                else fecharModalConfiguracao();
            }
        });
    });
});

async function salvarInsercao() {
    if (!produtoSelecionado) return;
    const btn = document.getElementById("ins-btn-salvar");
    btn.disabled = true;
    try {
        // Movimentação de entrada para ajustar quantidade inicial
        const qtd = parseInt(document.getElementById("ins-qtd").value) || 0;
        if (qtd > 0) {
            await apiPost("/Estoque/Movimentar", {
                IdProduto: produtoSelecionado.idProduto,
                TipoMovimentacao: "ENTRADA",
                Quantidade: qtd,
                Motivo: "Inserção inicial no estoque"
            });
        }
        // Configurar min/max/local
        await apiPost("/Estoque/AtualizarConfiguracao", {
            IdProduto: produtoSelecionado.idProduto,
            EstoqueMinimo: parseInt(document.getElementById("ins-min").value) || 0,
            EstoqueMaximo: parseInt(document.getElementById("ins-max").value) || 0,
            Local: document.getElementById("ins-local").value || null
        });
        // Associar fornecedor se selecionado
        if (fornecedorSelecionado) {
            await apiPost("/Estoque/AssociarFornecedor", {
                IdFornecedor: fornecedorSelecionado.idFornecedor,
                IdProduto: produtoSelecionado.idProduto,
                PrecoCompra: parseFloat(document.getElementById("ins-preco-compra").value) || 0
            });
        }
        fecharModalInserir();
        flexToast("Produto inserido no estoque!", "sucesso");
        await carregarEstoque();
    } catch (err) {
        flexToast("Erro ao inserir: " + err.message, "erro");
    } finally {
        btn.disabled = false;
    }
}

// ── Modal: Movimentação ────────────────────────────────────────────────────

function abrirModalMovimentacao(idProduto, nome) {
    document.getElementById("mov-idProduto").value = idProduto;
    document.getElementById("mov-produto-nome").textContent = nome;
    document.getElementById("mov-tipo").value = "ENTRADA";
    document.getElementById("mov-quantidade").value = "";
    document.getElementById("mov-motivo").value = "";
    document.getElementById("modal-movimentacao").classList.add("open");
}

function fecharModalMovimentacao() {
    document.getElementById("modal-movimentacao").classList.remove("open");
}

async function salvarMovimentacao() {
    const idProduto = parseInt(document.getElementById("mov-idProduto").value);
    const qtd = parseInt(document.getElementById("mov-quantidade").value);
    if (!qtd || qtd <= 0) { flexToast("Informe uma quantidade válida.", "aviso"); return; }
    try {
        await apiPost("/Estoque/Movimentar", {
            IdProduto: idProduto,
            TipoMovimentacao: document.getElementById("mov-tipo").value,
            Quantidade: qtd,
            Motivo: document.getElementById("mov-motivo").value || null
        });
        fecharModalMovimentacao();
        flexToast("Movimentação registrada!", "sucesso");
        await carregarEstoque();
    } catch (err) {
        flexToast("Erro: " + err.message, "erro");
    }
}

// ── Modal: Configuração de Estoque ────────────────────────────────────────

function abrirModalConfiguracao(idProduto, nome, min, max, local) {
    cfgEtapa = 1;
    cfgFornecedorSelecionado = null;
    document.getElementById("cfg-idProduto").value = idProduto;
    document.getElementById("cfg-produto-nome").textContent = nome;
    document.getElementById("cfg-min").value = min ?? "";
    document.getElementById("cfg-max").value = max ?? "";
    document.getElementById("cfg-local").value = local ?? "";
    document.getElementById("cfg-busca-fornecedor").value = "";
    document.getElementById("cfg-painel-preco").style.display = "none";
    irParaEtapaCfg(1);
    carregarFornecedores().then(() =>
        renderizarListaFornecedores("", "cfg-lista-fornecedores", null)
    );
    document.getElementById("modal-configuracao").classList.add("open");
}

function fecharModalConfiguracao() {
    document.getElementById("modal-configuracao").classList.remove("open");
}

function irParaEtapaCfg(etapa) {
    cfgEtapa = etapa;
    document.getElementById("cfg-etapa-1")?.classList.toggle("ativa", etapa === 1);
    document.getElementById("cfg-etapa-2")?.classList.toggle("ativa", etapa === 2);
    document.getElementById("cfg-step-1")?.classList.toggle("active", etapa === 1);
    document.getElementById("cfg-step-2")?.classList.toggle("active", etapa === 2);
    document.getElementById("cfg-btn-voltar").style.display = etapa > 1 ? "" : "none";
    document.getElementById("cfg-btn-proximo").style.display = etapa < CFG_TOTAL_ETAPAS ? "" : "none";
    document.getElementById("cfg-btn-salvar").style.display = etapa === CFG_TOTAL_ETAPAS ? "" : "none";
}

function cfgProximaEtapa() { irParaEtapaCfg(cfgEtapa + 1); }
function cfgVoltarEtapa() { irParaEtapaCfg(cfgEtapa - 1); }

async function salvarConfiguracao() {
    const idProduto = parseInt(document.getElementById("cfg-idProduto").value);
    try {
        await apiPost("/Estoque/AtualizarConfiguracao", {
            IdProduto: idProduto,
            EstoqueMinimo: parseInt(document.getElementById("cfg-min").value) || 0,
            EstoqueMaximo: parseInt(document.getElementById("cfg-max").value) || 0,
            Local: document.getElementById("cfg-local").value || null
        });
        if (cfgFornecedorSelecionado) {
            await apiPost("/Estoque/AssociarFornecedor", {
                IdFornecedor: cfgFornecedorSelecionado.idFornecedor,
                IdProduto: idProduto,
                PrecoCompra: parseFloat(document.getElementById("cfg-preco-compra").value) || 0
            });
        }
        fecharModalConfiguracao();
        flexToast("Configuração salva!", "sucesso");
        await carregarEstoque();
    } catch (err) {
        flexToast("Erro: " + err.message, "erro");
    }
}