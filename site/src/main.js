import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './style.css';
import { D, carregar, carregarCamera, dmy, esc, ICONE, camNome, SEM_GARAGEM } from './dados.js';
import { paginaMonitoramento } from './monitoramento.js';
import { paginaEstatisticas } from './estatisticas.js';

// Filtros aplicados (compartilhados entre as páginas; a página de estatísticas ignora o prefixo)
export const F = { empresa: '', garagem: '', camera: '', prefixo: '', de: '', ate: '' };
let carregado = false;

function cabecalho(pagina) {
  const upd = carregado ? `<span class="atualizacao ok" title="Horário do registro mais recente nos dados"><i class="pt"></i>Última atualização ${dmy(D.meta.atualizacao.slice(0, 10))} ${D.meta.atualizacao.slice(11, 16)}</span>` : '<span class="atualizacao"><i class="pt"></i>Carregando…</span>';
  const topo = document.getElementById('topo');
  if (pagina === 'estatisticas') {
    topo.innerHTML = `<div class="esq"><button class="btn-nav" id="nav" title="Voltar ao monitoramento" aria-label="Voltar ao monitoramento">${ICONE.esq}</button><div><h1 class="titulo">Estatísticas</h1><div class="subtitulo">Visão geral da operação</div></div></div><div class="dir">${upd}</div>`;
    document.getElementById('nav').onclick = () => { location.hash = ''; };
  } else {
    topo.innerHTML = `<div class="esq"><div><h1 class="titulo">Controle de CFTV</h1><div class="subtitulo">Monitoramento por Garagem, Prefixo e Câmera</div></div></div><div class="dir">${upd}<button class="btn-nav" id="nav" title="Ver estatísticas" aria-label="Ver estatísticas">${ICONE.dir}</button></div>`;
    document.getElementById('nav').onclick = () => { location.hash = 'estatisticas'; };
  }
}

export function barraFiltros(el, { prefixo = true } = {}, aoFiltrar) {
  const minD = D.dias[0], maxD = D.dias[D.nd - 1];
  el.innerHTML = `<div class="filtros">
    <div class="campo"><label for="f-empresa">Empresa</label><select id="f-empresa" class="w220"><option value="">Todas</option>${D.empresas.map((e) => `<option ${F.empresa === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
    <div class="campo"><label for="f-garagem">Garagem</label><select id="f-garagem" class="w220"><option value="">Todas</option>${D.garagens.map((g) => `<option ${F.garagem === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}<option ${F.garagem === SEM_GARAGEM ? 'selected' : ''}>${SEM_GARAGEM}</option></select></div>
    <div class="campo"><label for="f-camera">Câmera</label><select id="f-camera" class="w180"><option value="">Todas</option>${D.cameras.map((c) => `<option value="${c}" ${F.camera === String(c) ? 'selected' : ''}>${esc(camNome(c))}</option>`).join('')}</select></div>
    ${prefixo ? `<div class="campo"><label for="f-prefixo">Prefixo</label><input id="f-prefixo" class="w180" type="search" inputmode="numeric" placeholder="Ex.: 10003" value="${esc(F.prefixo)}" /></div>` : ''}
    <div class="campo"><span class="rot">Período</span><div class="periodo w280"><input id="f-de" type="date" min="${minD}" max="${maxD}" value="${F.de}" aria-label="Data inicial" /><span>–</span><input id="f-ate" type="date" min="${minD}" max="${maxD}" value="${F.ate}" aria-label="Data final" /></div></div>
    <button class="btn" id="f-ok">Filtrar</button></div>`;
  const aplicar = async () => {
    F.empresa = el.querySelector('#f-empresa').value;
    F.garagem = el.querySelector('#f-garagem').value;
    F.camera = el.querySelector('#f-camera').value;
    if (prefixo) F.prefixo = el.querySelector('#f-prefixo').value.trim();
    F.de = el.querySelector('#f-de').value; F.ate = el.querySelector('#f-ate').value;
    if (F.de && F.ate && F.de > F.ate) [F.de, F.ate] = [F.ate, F.de];
    if (F.camera) await carregarCamera(F.camera);
    aoFiltrar();
  };
  el.querySelector('#f-ok').onclick = aplicar;
  el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); }));
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
