// ===== MENU.JS — FlexGestor =====

const menuItens = [
    { label: "Início", icone: "bi-house-fill", rota: "Home" },
    {
        label: "Caixa", icone: "bi-cash-coin", rota: "Caixa",
        filhos: [{ label: "Controle de Caixa", rota: "Caixa" }]
    },
    {
        label: "Vendas", icone: "bi-bag-fill", rota: "Pedido",
        filhos: [{ label: "Pedidos", rota: "Pedido" }]
    },
    {
        label: "Financeiro", icone: "bi-bank", rota: "Financeiro",
        filhos: [{ label: "Contas a Receber / Pagar", rota: "Financeiro" }]
    },
    {
        label: "Estoque", icone: "bi-boxes", rota: "Estoque",
        filhos: [
            { label: "Controle de Estoque", rota: "Estoque" },
            { label: "Movimentações", rota: "EstoqueHistorico" }
        ]
    },
    {
        label: "Compras", icone: "bi-truck", futuro: true,
        filhos: [
            { label: "Pedidos de Compra", futuro: true },
            { label: "Entrada de Mercadoria", futuro: true }
        ]
    },
    {
        label: "Pessoas", icone: "bi-people-fill", rota: "Cliente",
        filhos: [
            { label: "Clientes", rota: "Cliente" },
            { label: "Fornecedores", rota: "Fornecedor" }
        ]
    },
    {
        label: "Cadastros", icone: "bi-box-seam", rota: "Produto",
        filhos: [
            { label: "Produtos", rota: "Produto" },
            { label: "Categorias", rota: "CategoriaProduto" },
            { label: "Despesas", rota: "Despesa" }
        ]
    },
    { label: "Auditoria", icone: "bi-shield-check", rota: "Auditoria" },
    {
        label: "Configurações", icone: "bi-gear-fill", rota: "Empresa",
        filhos: [
            { label: "Empresa", rota: "Empresa" },
            { label: "Usuários", rota: "Usuario" },
            { label: "Permissões", rota: "Permissao" }
        ]
    }
];

// ── Notificações ──────────────────────────
let notifCarregadas = false;
let notifCarregando = false;
let alertasCache = [];

function fmtNotif(v) {
    return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function safeGet(url, timeoutMs) {
    timeoutMs = timeoutMs || 4000;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    return fetch(url, { signal: ctrl.signal })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (d) { clearTimeout(timer); return Array.isArray(d) ? d : []; })
        .catch(function () { return []; });
}

// ── Construção do menu ────────────────────
async function inicializarMenu() {
    var rotaAtual = document.body.dataset.rota || "";

    var permissoes = null;
    try {
        var res = await fetch("/Permissao/MinhasPermissoes");
        if (res.ok) permissoes = await res.json();
    } catch (e) { /* sem permissões — exibe tudo */ }

    var temAcesso = function (rota) {
        if (!rota) return false;
        if (!permissoes) return true;
        if (permissoes.admin) return true;
        return permissoes.rotas && permissoes.rotas.some(function (r) {
            return r.toLowerCase() === rota.toLowerCase();
        });
    };

    var isAdmin = !permissoes || permissoes.admin === true;

    var container = document.getElementById("menu");
    if (!container) return;

    // ── HEADER ──────────────────────────────
    var cabecalho = document.createElement("header");
    cabecalho.className = "cabecalho";

    // FIX: estrutura com classes corretas para CSS funcionar
    cabecalho.innerHTML =
        // Lado esquerdo: logo
        '<h1><i class="bi bi-lightning-charge-fill"></i> FlexGestor</h1>' +

        // Lado direito: notificações + sair
        '<div class="cabecalho-direita">' +

        // Wrapper posicionado para o painel flutuante
        '<div class="notif-central">' +
        '<button class="notif-btn" onclick="toggleNotif(event)">' +
        '<i class="bi bi-bell-fill"></i>' +
        // FIX: classe em vez de id para o badge
        '<span class="notif-count" id="notif-count" style="display:none">0</span>' +
        '</button>' +

        // FIX: classe correta + estrutura interna com classes
        '<div class="notif-panel" id="notif-panel">' +
        '<div class="notif-panel-header">Alertas do Sistema</div>' +
        '<div class="notif-panel-lista" id="notif-lista">' +
        '<div class="notif-carregando">Carregando...</div>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<a href="/Login/Sair" class="sair">Sair</a>' +
        '</div>';

    container.appendChild(cabecalho);

    // ── SIDEBAR ──────────────────────────────
    var sidebar = document.createElement("nav");
    sidebar.className = "sidebar";   // FIX: classe que estava faltando (anterior PR)

    var ul = document.createElement("ul");

    menuItens.forEach(function (item) {

        // Regra de visibilidade para Configurações
        if (item.label === "Configurações") {
            if (!isAdmin && !temAcesso("Empresa")) return;
        }

        var paiAcessivel = item.futuro ? false
            : item.filhos
                ? item.filhos.some(function (f) { return !f.futuro && temAcesso(f.rota); })
                : temAcesso(item.rota);

        if (!item.futuro && !paiAcessivel) return;

        var li = document.createElement("li");

        var ativo = item.rota === rotaAtual ||
            (item.filhos && item.filhos.some(function (f) { return f.rota === rotaAtual; }));

        if (!item.filhos) {
            // ── Item simples ──────────────────
            if (item.futuro) {
                li.innerHTML = '<span class="menu-item-futuro">' +
                    '<span class="menu-item-label">' +
                    '<i class="bi ' + (item.icone || 'bi-circle') + '"></i>' +
                    item.label +
                    '</span>' +
                    '</span>';
            } else {
                // FIX: ícone incluído dentro do <a>
                li.innerHTML = '<a href="/' + item.rota + '" class="' + (ativo ? "active" : "") + '">' +
                    '<i class="bi ' + (item.icone || 'bi-circle') + '"></i>' +
                    item.label +
                    '</a>';
            }

        } else {
            // ── Item com submenu ──────────────
            li.className = "menu-expansivel" + (ativo ? " active" : "");
            if (item.futuro) li.classList.add("menu-futuro");

            // FIX: ícone incluído no span pai + seta
            li.innerHTML =
                '<span>' +
                '<span class="menu-item-label">' +
                '<i class="bi ' + (item.icone || 'bi-circle') + '"></i>' +
                item.label +
                '</span>' +
                '<i class="bi bi-chevron-down seta"></i>' +
                '</span>' +
                '<ul class="submenu"></ul>';

            var submenu = li.querySelector(".submenu");

            item.filhos.forEach(function (filho) {
                if ((filho.rota === "Usuario" || filho.rota === "Permissao") && !isAdmin) return;
                if (!filho.futuro && !temAcesso(filho.rota)) return;

                var liFilho = document.createElement("li");

                if (filho.futuro) {
                    liFilho.innerHTML = '<span class="menu-item-futuro">' + filho.label + '</span>';
                } else {
                    var ativoFilho = filho.rota === rotaAtual;
                    liFilho.innerHTML = '<a href="/' + filho.rota + '"' +
                        (ativoFilho ? ' class="active"' : '') + '>' +
                        filho.label + '</a>';
                }
                submenu.appendChild(liFilho);
            });

            // Se não tem filhos visíveis, não exibe o item pai
            if (!submenu.children.length) return;

            // Expansão ao clicar (só para itens não-futuro)
            if (!item.futuro) {
                var toggleSpan = li.querySelector("span");
                // Abre automaticamente se rota atual é filha
                if (ativo) {
                    submenu.style.maxHeight = "40rem";
                }
                toggleSpan.addEventListener("click", function () {
                    var aberto = li.classList.contains("active");
                    li.classList.toggle("active", !aberto);
                    submenu.style.maxHeight = aberto ? "" : "40rem";
                });
            }
        }

        ul.appendChild(li);
    });

    sidebar.appendChild(ul);
    container.appendChild(sidebar);

    // Fecha painel de notificações ao clicar fora
    document.addEventListener("click", function (e) {
        var panel = document.getElementById("notif-panel");
        var btn = document.querySelector(".notif-btn");
        if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove("aberto");
        }
    });

    // Aplica cache do dashboard se disponível
    if (window.__dashboardCache) {
        processarDashboardCache(window.__dashboardCache);
    }
}

// ── Toggle do painel de notificações ─────
function toggleNotif(e) {
    e.stopPropagation();
    var panel = document.getElementById("notif-panel");
    var aberto = panel.classList.contains("aberto");

    if (aberto) {
        panel.classList.remove("aberto");
        return;
    }

    panel.classList.add("aberto");

    // Lazy loading: carrega apenas na primeira abertura
    if (!notifCarregadas && !notifCarregando) {
        carregarNotificacoes();
    } else if (notifCarregadas) {
        renderizarLista(alertasCache);
    }
}

// ── Carregar alertas ──────────────────────
async function carregarNotificacoes() {
    notifCarregando = true;
    renderizarLista(null); // exibe "Carregando..."

    var resultados = await Promise.all([
        safeGet("/Estoque/Listar"),
        safeGet("/Financeiro/ListarContasReceber"),
        safeGet("/Financeiro/ListarContasPagar")
    ]);

    notifCarregando = false;
    notifCarregadas = true;
    alertasCache = montarAlertas(resultados[0], resultados[1], resultados[2]);

    atualizarContador(alertasCache);
    renderizarLista(alertasCache);
}

// ── Montar lista de alertas ───────────────
function montarAlertas(estoque, receber, pagar) {
    var alertas = [];

    // Estoque crítico
    var criticos = estoque.filter(function (e) {
        return (e.quantidade ?? 0) <= (e.estoqueMinimo ?? 0);
    });
    if (criticos.length > 0) {
        alertas.push({
            prioridade: "alta",
            titulo: criticos.length + " produto" + (criticos.length > 1 ? "s" : "") + " com estoque crítico",
            descricao: criticos.slice(0, 3).map(function (e) { return e.nomeProduto; }).join(", ") +
                (criticos.length > 3 ? " e mais " + (criticos.length - 3) + "..." : ""),
            rota: "/Estoque"
        });
    }

    // Contas a receber vencidas
    var vencidasR = receber.filter(function (c) { return c.statusAtual === "VENCIDO"; });
    if (vencidasR.length > 0) {
        var totalR = vencidasR.reduce(function (s, c) { return s + Math.max(0, c.valorTotal - c.valorPago); }, 0);
        alertas.push({
            prioridade: "media",
            titulo: vencidasR.length + " conta" + (vencidasR.length > 1 ? "s" : "") + " a receber vencida" + (vencidasR.length > 1 ? "s" : ""),
            descricao: "Total em aberto: " + fmtNotif(totalR),
            rota: "/Financeiro"
        });
    }

    // Contas a pagar vencidas
    var vencidasP = pagar.filter(function (c) { return c.statusAtual === "VENCIDO"; });
    if (vencidasP.length > 0) {
        var totalP = vencidasP.reduce(function (s, c) { return s + Math.max(0, c.valorTotal - c.valorPago); }, 0);
        alertas.push({
            prioridade: "alta",
            titulo: vencidasP.length + " conta" + (vencidasP.length > 1 ? "s" : "") + " a pagar vencida" + (vencidasP.length > 1 ? "s" : ""),
            descricao: "Total em aberto: " + fmtNotif(totalP),
            rota: "/Financeiro"
        });
    }

    return alertas;
}

// ── Atualizar badge de contador ───────────
function atualizarContador(alertas) {
    var count = document.getElementById("notif-count");
    if (!count) return;

    if (!alertas || alertas.length === 0) {
        count.style.display = "none";
        return;
    }

    count.textContent = alertas.length;
    count.style.display = "flex";
}

// ── Renderizar lista no painel ────────────
function renderizarLista(alertas) {
    var lista = document.getElementById("notif-lista");
    if (!lista) return;

    if (alertas === null) {
        lista.innerHTML = '<div class="notif-carregando">Carregando alertas...</div>';
        return;
    }

    if (!alertas.length) {
        lista.innerHTML = '<div class="notif-vazio"><i class="bi bi-check-circle" style="font-size:2rem;color:#16a34a;display:block;margin-bottom:.8rem"></i>Nenhum alerta no momento.</div>';
        return;
    }

    var classePrioridade = { alta: "notif-item-alta", media: "notif-item-media", baixa: "notif-item-baixa" };

    lista.innerHTML = alertas.map(function (a) {
        var cls = classePrioridade[a.prioridade] || "notif-item-baixa";
        return '<div class="notif-item ' + cls + '">' +
            '<div class="notif-item-header">' +
            '<div class="notif-item-titulo">' + a.titulo + '</div>' +
            '</div>' +
            (a.descricao ? '<p class="notif-item-descricao">' + a.descricao + '</p>' : '') +
            '<a href="' + a.rota + '" class="notif-item-acao">Ver detalhes</a>' +
            '</div>';
    }).join("");
}

// ── processarDashboardCache (chamado pelo Home) ──
function processarDashboardCache(d) {
    if (!d) return;

    var alertas = [];

    if (d.produtosEstoqueCritico > 0) {
        alertas.push({
            prioridade: "alta",
            titulo: d.produtosEstoqueCritico + " produto(s) com estoque crítico",
            descricao: null,
            rota: "/Estoque"
        });
    }

    if (d.saldoDevedorTotal > 0) {
        alertas.push({
            prioridade: "media",
            titulo: "Saldo devedor de clientes: " + fmtNotif(d.saldoDevedorTotal),
            descricao: null,
            rota: "/Financeiro"
        });
    }

    if (alertas.length) {
        alertasCache = alertas;
        notifCarregadas = true;
        atualizarContador(alertas);
    }
}

// ── Init ─────────────────────────────────
inicializarMenu();