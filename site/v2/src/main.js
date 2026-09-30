import './style.css';
import { D, carregar, carregarCamera, dmy, esc, ICONE, camNome, GRUPO_METROPOLE, nomeMes } from './dados.js';
import { paginaVisao } from './visao.js';
import { paginaMatriz } from './matriz.js';

// Filtros compartilhados entre as abas. Visão geral: empresa, câmera, prefixo, período. Matriz: empresa, câmera, mês.
export const F = { empresa: '', camera: '', prefixo: '', de: '', ate: '', mes: '' };
let carregado = false;
const ABAS = {
  visao: { titulo: 'Visão geral', sub: 'Situação atual por Garagem/Empresa, evolução diária e manutenção', icone: ICONE.tabela },
  matriz: { titulo: 'Matriz', sub: 'Status diário por prefixo e câmera', icone: ICONE.matriz },
};

// Cabeçalho sem barra + barra lateral em pílula com as abas (dica com o título no hover/foco)
function cabecalho(aba) {
  const upd = carregado ? `<span class="atualizacao ok" title="Horário do registro mais recente nos dados"><i class="pt"></i><span class="upd-r">Última atualização</span> ${dmy(D.meta.atualizacao.slice(0, 10))} ${D.meta.atualizacao.slice(11, 16)}</span>` : '<span class="atualizacao"><i class="pt"></i>Carregando…</span>';
  document.getElementById('topo').innerHTML = `<div class="esq"><h1 class="titulo">Controle de CFTV</h1><div class="subtitulo">${ABAS[aba].titulo} · ${ABAS[aba].sub}</div></div><div class="dir">${upd}</div>`;
  document.getElementById('lateral').innerHTML = `<div class="logo" title="Controle de CFTV">${ICONE.sol}</div>
    <nav class="nav-pill" aria-label="Abas">${Object.entries(ABAS).map(([k, a]) => `<button class="nav-b${k === aba ? ' ativo' : ''}" id="nav-${k}" data-tip="${a.titulo}" aria-label="${a.titulo}" ${k === aba ? 'aria-current="page"' : ''}>${a.icone}<span class="nav-rot">${a.titulo}</span></button>`).join('')}</nav>`;
  document.getElementById('nav-visao').onclick = () => { location.hash = ''; };
  document.getElementById('nav-matriz').onclick = () => { location.hash = 'matriz'; };
  // toque longo mostra o título da aba
  document.querySelectorAll('.nav-b').forEach((b) => {
    let t = 0;
    b.addEventListener('touchstart', () => { t = setTimeout(() => b.classList.add('mostrar-tip'), 450); }, { passive: true });
    b.addEventListener('touchend', () => { clearTimeout(t); setTimeout(() => b.classList.remove('mostrar-tip'), 1200); });
  });
}

// Barra de filtros aplicados automaticamente. campos: empresa, camera, prefixo, periodo, mes. extra: HTML à direita.
export function barraFiltros(el, campos, aoFiltrar, extra = '') {
  const minD = D.dias[0], maxD = D.dias[D.nd - 1];
  const tem = (k) => campos.includes(k);
  el.innerHTML = `<div class="filtros"><div class="filtros-campos">
    <div class="campo"><label for="f-empresa">Empresa/Garagem</label><select id="f-empresa" class="w220"><option value="">Todas</option><option value="${GRUPO_METROPOLE}" ${F.empresa === GRUPO_METROPOLE ? 'selected' : ''} title="Todas as garagens/empresas Metrópole">METROPOLE (todas)</option>${D.garagens.map((e) => `<option ${F.empresa === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
    <div class="campo"><label for="f-camera">Câmera</label><select id="f-camera" class="w180"><option value="">Todas</option>${D.cameras.map((c) => `<option value="${c}" ${F.camera === String(c) ? 'selected' : ''}>${esc(camNome(c))}</option>`).join('')}</select></div>
    ${tem('prefixo') ? `<div class="campo"><label for="f-prefixo">Prefixo</label><input id="f-prefixo" class="w140" type="search" inputmode="numeric" placeholder="Ex.: 10003" value="${esc(F.prefixo)}" /></div>` : ''}
    ${tem('periodo') ? `<div class="campo"><span class="rot">Período</span><div class="periodo w280"><input id="f-de" type="date" min="${minD}" max="${maxD}" value="${F.de}" aria-label="Data inicial" /><span>–</span><input id="f-ate" type="date" min="${minD}" max="${maxD}" value="${F.ate}" aria-label="Data final" /></div></div>` : ''}
    ${tem('mes') ? `<div class="campo"><label for="f-mes">Mês</label><select id="f-mes" class="w220">${D.meses.slice().reverse().map((m) => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select></div>` : ''}
    </div>${extra ? `<div class="filtros-extra">${extra}</div>` : ''}</div>`;
  const aplicar = async () => {
    F.empresa = el.querySelector('#f-empresa').value;
    F.camera = el.querySelector('#f-camera').value;
    if (tem('prefixo')) F.prefixo = el.querySelector('#f-prefixo').value.trim();
    if (tem('periodo')) {
      F.de = el.querySelector('#f-de').value; F.ate = el.querySelector('#f-ate').value;
      if (F.de && F.ate && F.de > F.ate) [F.de, F.ate] = [F.ate, F.de];
    }
    if (tem('mes')) F.mes = el.querySelector('#f-mes').value;
    if (F.camera) await carregarCamera(F.camera);
    aoFiltrar();
  };
  // selects e datas na mudança; prefixo enquanto digita (debounce de 300 ms)
  let espera = 0;
  el.querySelectorAll('.filtros-campos select, .filtros-campos input[type=date]').forEach((i) => i.addEventListener('change', aplicar));
  const pre = el.querySelector('#f-prefixo');
  if (pre) {
    pre.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 300); });
    pre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(espera); aplicar(); } });
  }
}

function rota() {
  const aba = location.hash === '#matriz' ? 'matriz' : 'visao';
  cabecalho(aba);
  document.getElementById('tip').style.display = 'none';
  document.getElementById('modal')?.remove();
  if (!carregado) return;
  if (!F.mes) F.mes = D.meses[D.meses.length - 1]; // Mês padrão: o mais recente dos dados
  const app = document.getElementById('app');
  app.dataset.aba = aba;
  (aba === 'matriz' ? paginaMatriz : paginaVisao)(app);
}

async function iniciar() {
  rota();
  try {
    await carregar();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="vazio">Não foi possível carregar os dados (${esc(e.message)}).</div>`;
    return;
  }
  carregado = true;
  window.addEventListener('hashchange', rota);
  rota();
}
iniciar();
