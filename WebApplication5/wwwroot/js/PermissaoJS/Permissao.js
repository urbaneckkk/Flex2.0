
let listaCargos = [];
let listaMenus = [];
let listaCampos = [];
let cargoAtual = null;

const MENU_ICONES = {
    'Home': 'bi-house-fill', 'Usuario': 'bi-person-fill',
    'Cliente': 'bi-people-fill', 'Pedido': 'bi-bag-fill',
    'Caixa': 'bi-cash-coin', 'Estoque': 'bi-boxes',
    'Auditoria': 'bi-shield-check', 'Fornecedor': 'bi-building',
    'CategoriaProduto': 'bi-tag-fill', 'ML': 'bi-graph-up-arrow',
    'Permissao': 'bi-shield-lock-fill', 'Financeiro': 'bi-bank',
    'Despesa': 'bi-receipt', 'Produto': 'bi-box-seam',
    'EstoqueHistorico': 'bi-clock-history',
};

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
    return res;
}

function flexToast(msg, tipo = 'sucesso') {
    const cores = { sucesso: '#15803d', erro: '#dc2626', aviso: '#d97706' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;`;
    t.innerHTML = `<i class="bi bi-check-circle-fill"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
        t.style.opacity = '0'; t.style.transform = 'translateY(-1rem)';
        setTimeout(() => t.remove(), 350);
    }, 3200);
}

// FIX: função que exibe status de salvamento
function setStatus(tipo) {
    const el = document.getElementById('status-salvamento');
    if (!el) return;
    if (!tipo) {
        el.textContent = 'As alterações só são aplicadas após salvar.';
        el.className = 'perm-footer-info';
    } else if (tipo === 'sucesso') {
        el.innerHTML = '<i class="bi bi-check-circle-fill"></i> Permissões salvas com sucesso!';
        el.className = 'perm-footer-info sucesso';
    } else {
        el.innerHTML = '<i class="bi bi-x-circle-fill"></i> Erro ao salvar permissões.';
        el.className = 'perm-footer-info erro';
    }
}

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────
async function inicializar() {
    try {
        listaCargos = await apiGet('/Usuario/ListarCargos');
        renderizarCargos();
    } catch (err) {
        flexToast('Erro ao carregar cargos', 'erro');
    }
}

// FIX: função que estava completamente ausente
function renderizarCargos() {
    const container = document.getElementById('lista-cargos');
    if (!container) return;

    const cores = ['cargo-cor-1', 'cargo-cor-2', 'cargo-cor-3', 'cargo-cor-4', 'cargo-cor-5'];

    if (!listaCargos || listaCargos.length === 0) {
        container.innerHTML = `<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:1.3rem">Nenhum cargo encontrado.</div>`;
        return;
    }

    container.innerHTML = listaCargos.map((c, i) => {
        const cor = cores[i % cores.length];
        const inicial = (c.nome ?? 'C')[0].toUpperCase();
        return `
        <div class="perm-cargo-item${cargoAtual === c.idCargo ? ' ativo' : ''}"
             onclick="selecionarCargo(${c.idCargo}, '${(c.nome ?? '').replace(/'/g, "\\'")}')">
            <div class="perm-cargo-avatar ${cor}">${inicial}</div>
            <div class="perm-cargo-info">
                <div class="perm-cargo-nome">${c.nome}</div>
                <div class="perm-cargo-desc">${c.descricao || 'Cargo do sistema'}</div>
            </div>
            <i class="bi bi-chevron-right perm-cargo-seta"></i>
        </div>`;
    }).join('');
}

// ──────────────────────────────────────────
// SELECIONAR CARGO — FIX: separado de carregarPermissoes
// ──────────────────────────────────────────
async function selecionarCargo(idCargo, nomeCargo) {
    cargoAtual = idCargo;

    // Atualiza visual da sidebar
    renderizarCargos();

    // Mostra editor
    document.getElementById('perm-vazio').style.display = 'none';
    const editor = document.getElementById('perm-editor');
    editor.style.display = 'flex';
    editor.style.flexDirection = 'column';
    editor.style.gap = '2rem';

    setStatus('');

    try {
        [listaMenus, listaCampos] = await Promise.all([
            apiGet(`/Permissao/ListarMenus?idCargo=${idCargo}`),
            apiGet(`/Permissao/ListarCampos?idCargo=${idCargo}`)
        ]);
        renderizarMenus();
        renderizarCampos();
    } catch (err) {
        flexToast('Erro ao carregar permissões', 'erro');
    }
}

// ──────────────────────────────────────────
// RENDERIZAR MENUS
// ──────────────────────────────────────────
function renderizarMenus() {
    const container = document.getElementById('lista-menus');
    if (!container) return;

    if (!listaMenus || listaMenus.length === 0) {
        container.innerHTML = `<div class="empty-state">Nenhum menu encontrado.</div>`;
        return;
    }

    container.innerHTML = listaMenus.map(m => renderizarItemMenu(m)).join('');
}

// FIX: template literal e estrutura corrigidos
function renderizarItemMenu(m, filho = false) {
    const icone = MENU_ICONES[m.rota] ?? 'bi-circle';
    const ativo = m.temAcesso;

    return `
    <div class="perm-menu-card ${ativo ? 'permitido' : 'bloqueado'}"
         id="menu-item-${m.idMenu}"
         style="${filho ? 'margin-left:2rem;' : ''}">
        <div class="perm-menu-icon">
            <i class="bi ${icone}"></i>
        </div>
        <div class="perm-menu-info">
            <div class="perm-menu-nome">${m.nome}</div>
            <div class="perm-menu-rota">/${m.rota}</div>
        </div>
        <label class="perm-switch" onclick="event.stopPropagation()">
            <input type="checkbox"
                data-menu-id="${m.idMenu}"
                ${ativo ? 'checked' : ''}
                onchange="toggleMenu(this, ${m.idMenu})">
            <span class="perm-switch-slider"></span>
        </label>
    </div>`;
}

// FIX: assinatura corrigida (recebe el + idMenu)
function toggleMenu(el, idMenu) {
    const item = document.getElementById(`menu-item-${idMenu}`);
    const ativo = el.checked;

    const m = listaMenus.find(x => x.idMenu === idMenu);
    if (m) m.temAcesso = ativo;

    if (item) {
        item.classList.toggle('permitido', ativo);
        item.classList.toggle('bloqueado', !ativo);
    }
}

function marcarTodosMenus(valor) {
    listaMenus.forEach(m => m.temAcesso = valor);
    renderizarMenus();
}

// ──────────────────────────────────────────
// RENDERIZAR CAMPOS
// ──────────────────────────────────────────
function renderizarCampos() {
    // FIX: usava variável "tbody" não definida — agora usa "container" corretamente
    const container = document.getElementById('lista-campos');
    if (!container) return;

    if (!listaCampos || listaCampos.length === 0) {
        container.innerHTML = `<tr><td colspan="4" class="empty-state">Nenhum campo encontrado.</td></tr>`;
        return;
    }

    const secoes = {};
    listaCampos.forEach(c => {
        const sec = c.secao || 'Geral';
        if (!secoes[sec]) secoes[sec] = [];
        secoes[sec].push(c);
    });

    let html = '';
    Object.entries(secoes).forEach(([secao, itens]) => {
        html += `<tr><td colspan="4" class="perm-secao-label">${secao}</td></tr>`;
        itens.forEach(c => {
            const editBloqueado = !c.visivel;
            html += `
            <tr>
                <td>${c.nome}</td>
                <td><code style="font-size:1.1rem;color:#9ca3af">${c.chave}</code></td>
                <td style="text-align:center">
                    <label class="perm-switch">
                        <input type="checkbox"
                            data-campo-id="${c.idCampo}"
                            data-tipo="visivel"
                            ${c.visivel ? 'checked' : ''}
                            onchange="toggleCampo(this, ${c.idCampo}, 'visivel')">
                        <span class="perm-switch-slider"></span>
                    </label>
                </td>
                <td style="text-align:center">
                    <label class="perm-switch">
                        <input type="checkbox"
                            data-campo-id="${c.idCampo}"
                            data-tipo="editavel"
                            ${c.editavel ? 'checked' : ''}
                            ${editBloqueado ? 'disabled' : ''}
                            onchange="toggleCampo(this, ${c.idCampo}, 'editavel')">
                        <span class="perm-switch-slider"></span>
                    </label>
                </td>
            </tr>`;
        });
    });

    container.innerHTML = html;
}

function toggleCampo(el, idCampo, tipo) {
    const c = listaCampos.find(x => x.idCampo === idCampo);
    if (!c) return;

    c[tipo] = el.checked;

    if (tipo === 'visivel') {
        // Busca o toggle de editável na mesma linha
        const row = el.closest('tr');
        const editavelToggle = row?.querySelector('[data-tipo="editavel"]');
        if (!el.checked) {
            c.editavel = false;
            if (editavelToggle) { editavelToggle.checked = false; editavelToggle.disabled = true; }
        } else {
            if (editavelToggle) editavelToggle.disabled = false;
        }
    }
}

function marcarTodosCampos(tipo, valor) {
    listaCampos.forEach(c => {
        c[tipo] = valor;
        if (tipo === 'visivel' && !valor) c.editavel = false;
    });
    renderizarCampos();
}

// ──────────────────────────────────────────
// ABAS
// ──────────────────────────────────────────
function mudarAba(aba) {
    document.getElementById('aba-menus').style.display = aba === 'menus' ? '' : 'none';
    document.getElementById('aba-campos').style.display = aba === 'campos' ? '' : 'none';
    document.getElementById('tab-menus-btn').classList.toggle('ativa', aba === 'menus');
    document.getElementById('tab-campos-btn').classList.toggle('ativa', aba === 'campos');
}

// ──────────────────────────────────────────
// SALVAR
// ──────────────────────────────────────────
async function salvarPermissoes() {
    if (!cargoAtual) return;
    const btn = document.querySelector('.btn-salvar-perm');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Salvando...';
    setStatus('');

    try {
        await apiPost('/Permissao/Salvar', {
            IdCargo: cargoAtual,
            Menus: listaMenus.map(m => ({
                IdCargo: cargoAtual,
                IdMenu: m.idMenu,
                FAtivo: m.temAcesso
            })),
            Campos: listaCampos.map(c => ({
                IdCargo: cargoAtual,
                IdCampo: c.idCampo,
                Visivel: c.visivel,
                Editavel: c.editavel
            }))
        });
        setStatus('sucesso');
        flexToast('Permissões salvas com sucesso!', 'sucesso');
    } catch (err) {
        setStatus('erro');
        flexToast('Erro ao salvar: ' + err.message, 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar Permissões';
    }
}

document.addEventListener('DOMContentLoaded', inicializar);