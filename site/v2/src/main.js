import './style.css';
import { D, carregar, carregarCamera, dmy, esc, ICONE, camNome, GRUPO_METROPOLE } from './dados.js';
import { paginaMonitoramento } from './monitoramento.js';
import { paginaEstatisticas } from './estatisticas.js';

// Filtros aplicados (compartilhados entre as páginas; a página de estatísticas ignora o prefixo)
export const F = { empresa: '', camera: '', prefixo: '', de: '', ate: '' };
let carregado = false;

// v2: sem barra de cabeçalho; navegação na barra lateral (Monitoramento / Estatísticas)
function cabecalho(pagina) {
  const upd = carregado ? `<span class="atualizacao ok" title="Horário do registro mais recente nos dados"><i class="pt"></i>Última atualização ${dmy(D.meta.atualizacao.slice(0, 10))} ${D.meta.atualizacao.slice(11, 16)}</span>` : '<span class="atualizacao"><i class="pt"></i>Carregando…</span>';
  const est = pagina === 'estatisticas';
  document.getElementById('topo').innerHTML = `<div class="esq"><div><h1 class="titulo">${est ? 'Estatísticas' : 'Controle de CFTV'}</h1><div class="subtitulo">${est ? 'Visão geral da operação' : 'Monitoramento por Garagem, Prefixo e Câmera'}</div></div></div><div class="dir">${upd}</div>`;
  document.getElementById('lateral').innerHTML = `<div class="logo" title="Controle de CFTV">${ICONE.sol}</div>
    <nav class="nav-pill" aria-label="Páginas">
      <button class="nav-b${est ? '' : ' ativo'}" id="nav-mon" title="Monitoramento" aria-label="Monitoramento" ${est ? '' : 'aria-current="page"'}>${ICONE.grade}</button>
      <button class="nav-b${est ? ' ativo' : ''}" id="nav-est" title="Estatísticas" aria-label="Estatísticas" ${est ? 'aria-current="page"' : ''}>${ICONE.grafico}</button>
    </nav>`;
  document.getElementById('nav-mon').onclick = () => { location.hash = ''; };
  document.getElementById('nav-est').onclick = () => { location.hash = 'estatisticas'; };
}

export function barraFiltros(el, { prefixo = true } = {}, aoFiltrar) {
  const minD = D.dias[0], maxD = D.dias[D.nd - 1];
  el.innerHTML = `<div class="filtros">
    <div class="campo"><label for="f-empresa">Empresa</label><select id="f-empresa" class="w220"><option value="">Todas</option><option value="${GRUPO_METROPOLE}" ${F.empresa === GRUPO_METROPOLE ? 'selected' : ''} title="Todas as empresas com METROPOLE no nome">METROPOLE</option>${D.empresas.map((e) => `<option ${F.empresa === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
    <div class="campo"><label for="f-camera">Câmera</label><select id="f-camera" class="w180"><option value="">Todas</option>${D.cameras.map((c) => `<option value="${c}" ${F.camera === String(c) ? 'selected' : ''}>${esc(camNome(c))}</option>`).join('')}</select></div>
    ${prefixo ? `<div class="campo"><label for="f-prefixo">Prefixo</label><input id="f-prefixo" class="w180" type="search" inputmode="numeric" placeholder="Ex.: 10003" value="${esc(F.prefixo)}" /></div>` : ''}
    <div class="campo"><span class="rot">Período</span><div class="periodo w280"><input id="f-de" type="date" min="${minD}" max="${maxD}" value="${F.de}" aria-label="Data inicial" /><span>–</span><input id="f-ate" type="date" min="${minD}" max="${maxD}" value="${F.ate}" aria-label="Data final" /></div></div>
    </div>`;
  const aplicar = async () => {
    F.empresa = el.querySelector('#f-empresa').value;
    F.camera = el.querySelector('#f-camera').value;
    if (prefixo) F.prefixo = el.querySelector('#f-prefixo').value.trim();
    F.de = el.querySelector('#f-de').value; F.ate = el.querySelector('#f-ate').value;
    if (F.de && F.ate && F.de > F.ate) [F.de, F.ate] = [F.ate, F.de];
    if (F.camera) await carregarCamera(F.camera);
    aoFiltrar();
  };
  // Filtros aplicados automaticamente: selects e datas na mudança; prefixo enquanto digita (debounce de 300 ms)
  let espera = 0;
  el.querySelectorAll('select, input[type=date]').forEach((i) => i.addEventListener('change', aplicar));
  const pre = el.querySelector('#f-prefixo');
  if (pre) {
    pre.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 300); });
    pre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(espera); aplicar(); } });
  }
}

function rota() {
  const pagina = location.hash === '#estatisticas' ? 'estatisticas' : 'monitoramento';
  cabecalho(pagina);
  const app = document.getElementById('app');
  document.getElementById('tip').style.display = 'none';
  if (!carregado) return;
  (pagina === 'estatisticas' ? paginaEstatisticas : paginaMonitoramento)(app);
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
