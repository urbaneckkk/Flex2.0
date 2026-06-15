// ===== ESTOQUE HISTORICO.JS — FlexGestor =====
// FIX: arquivo continha código do despesa.js. Reescrito com lógica correta.

let todosHistorico = [];
let filtroTipo = 'todos';
let filtroTexto = '';
let filtroDataInicio = '';
let filtroDataFim = '';

const PAG = 20;
let pagAtual = 1;

// ── Helpers ──────────────────────────────
async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
}

function flexToast(msg, tipo = 'sucesso') {
    const cores = { sucesso: '#15803d', erro: '#dc2626', aviso: '#d97706' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:2rem;right:2rem;background:${cores[tipo]};color:#fff;
        padding:1.2rem 1.8rem;border-radius:.8rem;font-size:1.4rem;font-family:'Segoe UI',sans-serif;
        display:flex;align-items:center;gap:.8rem;box-shadow:0 .6rem 2rem rgba(0,0,0,.2);
        z-index:9999;opacity:0;transform:translateY(-1rem);transition:all .3s ease;max-width:36rem;`;
    t.innerHTML = `<i class="bi bi-check-circle-fill"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-1rem)'; setTimeout(() => t.remove(), 350); }, 3200);
}

function fmtDataHora(s) {
    if (!s) return '—';
    const local = s.endsWith('Z') ? s.slice(0, -1) : s;
    return new Date(local).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ── Carregar ─────────────────────────────
async function carregar() {
    try {
        todosHistorico = await apiGet('/EstoqueHistorico/Listar');
        pagAtual = 1;
        renderizar();
    } catch (err) {
        flexToast('Erro ao carregar histórico: ' + err.message, 'erro');
    }
}

// ── Filtros ──────────────────────────────
// Chamado pelos botões Todos / Entrada / Saída / Ajuste
function setFiltroTipo(valor) {
    filtroTipo = valor;

    document.querySelectorAll('.btn-status-filtro').forEach(b =>
        b.classList.remove('sel-todos', 'sel-entrada', 'sel-saida', 'sel-ajuste'));

    const mapa = {
        todos: 'sel-todos',
        entrada: 'sel-entrada',
        saida: 'sel-saida',
        ajuste: 'sel-ajuste'
    };
    document.getElementById(`btn-filtro-${valor}`)?.classList.add(mapa[valor]);

    pagAtual = 1;
    renderizar();
}

// Chamado pelo input de busca e pelos date pickers
function filtrarHistorico() {
    filtroTexto = document.getElementById('input-busca')?.value ?? '';
    filtroDataInicio = document.getElementById('data-inicio')?.value ?? '';
    filtroDataFim = document.getElementById('data-fim')?.value ?? '';
    pagAtual = 1;
    renderizar();
}

// ── Renderizar ───────────────────────────
function renderizar() {
    const termo = filtroTexto.toLowerCase();

    const lista = todosHistorico.filter(h => {
        // Filtro por tipo
        if (filtroTipo !== 'todos') {
            const tipoNorm = (h.tipoMovimentacao ?? h.tipo ?? '').toUpperCase();
            if (tipoNorm !== filtroTipo.toUpperCase()) return false;
        }

        // Filtro por nome do produto
        if (termo && !(h.nomeProduto ?? '').toLowerCase().includes(termo)) return false;

        // Filtro por data início
        if (filtroDataInicio && h.dthMovimentacao) {
            const data = new Date(h.dthMovimentacao);
            const inicio = new Date(filtroDataInicio + 'T00:00:00');
            if (data < inicio) return false;
        }

        // Filtro por data fim
        if (filtroDataFim && h.dthMovimentacao) {
            const data = new Date(h.dthMovimentacao);
            const fim = new Date(filtroDataFim + 'T23:59:59');
            if (data > fim) return false;
        }

        return true;
    });

    const tbody = document.getElementById('tbody-historico');
    const total = lista.length;
    const inicio = (pagAtual - 1) * PAG;
    const pagina = lista.slice(inicio, inicio + PAG);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhuma movimentação encontrada.</td></tr>`;
        renderizarPaginacao(0);
        return;
    }

    const CONFIG_TIPO = {
        'ENTRADA': { classe: 'mov-entrada', qtdClasse: 'qtd-entrada', label: 'Entrada', prefixo: '+' },
        'SAIDA': { classe: 'mov-saida', qtdClasse: 'qtd-saida', label: 'Saída', prefixo: '-' },
        'AJUSTE': { classe: 'mov-ajuste', qtdClasse: 'qtd-ajuste', label: 'Ajuste', prefixo: '±' },
    };

    tbody.innerHTML = pagina.map(h => {
        const tipoKey = (h.tipoMovimentacao ?? h.tipo ?? '').toUpperCase();
        const cfg = CONFIG_TIPO[tipoKey] ?? { classe: 'mov-ajuste', qtdClasse: 'qtd-ajuste', label: h.tipo, prefixo: '' };

        return `
        <tr>
            <td>${fmtDataHora(h.dthMovimentacao)}</td>
            <td>${h.nomeProduto ?? h.NomeProduto ?? '—'}</td>
            <td><span class="badge-mov ${cfg.classe}">${cfg.label}</span></td>
            <td style="text-align:right">
                <strong class="${cfg.qtdClasse}">${cfg.prefixo}${h.quantidade ?? h.Quantidade ?? 0}</strong>
            </td>
            <td>${h.nomeUsuario ?? h.NomeUsuario ?? '—'}</td>
            <td>${h.motivo ?? h.observacao ?? h.Observacao ?? '—'}</td>
        </tr>`;
    }).join('');

    renderizarPaginacao(total);
}

function renderizarPaginacao(total) {
    const totalPags = Math.ceil(total / PAG);
    const ini = total === 0 ? 0 : (pagAtual - 1) * PAG + 1;
    const fim = Math.min(pagAtual * PAG, total);

    const infoEl = document.querySelector('.paginacao-info');
    if (infoEl) infoEl.textContent = total === 0 ? 'Nenhum registro' : `Mostrando ${ini}–${fim} de ${total}`;

    const ctrl = document.querySelector('.paginacao-controles');
    if (!ctrl) return;
    ctrl.innerHTML = '';

    const prev = document.createElement('button');
    prev.className = 'btn-pagina'; prev.textContent = '‹'; prev.disabled = pagAtual === 1;
    prev.onclick = () => { pagAtual--; renderizar(); };
    ctrl.appendChild(prev);

    for (let i = 1; i <= totalPags; i++) {
        const btn = document.createElement('button');
        btn.className = `btn-pagina${i === pagAtual ? ' ativo' : ''}`;
        btn.textContent = i;
        btn.onclick = () => { pagAtual = i; renderizar(); };
        ctrl.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'btn-pagina'; next.textContent = '›'; next.disabled = pagAtual >= totalPags;
    next.onclick = () => { pagAtual++; renderizar(); };
    ctrl.appendChild(next);
}

// ── Init ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Estado inicial: filtro "Todos" ativo
    setFiltroTipo('todos');

    // Listeners para inputs de filtro
    document.getElementById('input-busca')?.addEventListener('input', filtrarHistorico);
    document.getElementById('data-inicio')?.addEventListener('change', filtrarHistorico);
    document.getElementById('data-fim')?.addEventListener('change', filtrarHistorico);

    // Carrega dados
    carregar();
});