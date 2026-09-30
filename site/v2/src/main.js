import './style.css';
import { D, carregar, carregarCamera, dmy, esc, ICONE, camNome, GRUPO_METROPOLE, nomeMes } from './dados.js';
import { paginaVisao } from './visao.js';
import { paginaMatriz } from './matriz.js';
import { calendario } from './calendario.js';

// Filtros compartilhados entre as abas. Visão geral: empresa, câmera, prefixo, período. Matriz: empresa, câmera, mês.
export const F = { empresa: '', camera: '', prefixo: '', de: '', ate: '', mes: '' };
let carregado = false;
const ABAS = { visao: { titulo: 'Visão geral', icone: ICONE.tabela }, matriz: { titulo: 'Matriz', icone: ICONE.matriz } };

// Cabeçalho sem barra: título à esquerda e filtros na mesma linha, à direita. Última atualização fixa no canto
// inferior direito. Barra lateral em pílula com as abas (dica com o título no hover/foco/toque longo).
function cabecalho(aba) {
  document.getElementById('topo').innerHTML = `<h1 class="titulo">Controle de CFTV</h1><div class="topo-filtros" id="topo-filtros"></div>`;
  const upd = document.getElementById('upd');
  upd.className = `atualizacao${carregado ? ' ok' : ''}`;
  upd.innerHTML = carregado ? `<i class="pt"></i>Última atualização ${dmy(D.meta.atualizacao.slice(0, 10))} ${D.meta.atualizacao.slice(11, 16)}` : '<i class="pt"></i>Carregando…';
  upd.title = 'Horário do registro mais recente nos dados';
  document.getElementById('lateral').innerHTML = `<nav class="nav-pill" aria-label="Abas">${Object.entries(ABAS).map(([k, a]) => `<button class="nav-b${k === aba ? ' ativo' : ''}" id="nav-${k}" data-tip="${a.titulo}" aria-label="${a.titulo}" ${k === aba ? 'aria-current="page"' : ''}>${a.icone}<span class="nav-rot">${a.titulo}</span></button>`).join('')}</nav>`;
  document.getElementById('nav-visao').onclick = () => { location.hash = ''; };
  document.getElementById('nav-matriz').onclick = () => { location.hash = 'matriz'; };
  document.querySelectorAll('.nav-b').forEach((b) => {
    let t = 0;
    b.addEventListener('touchstart', () => { t = setTimeout(() => b.classList.add('mostrar-tip'), 450); }, { passive: true });
    b.addEventListener('touchend', () => { clearTimeout(t); setTimeout(() => b.classList.remove('mostrar-tip'), 1200); });
  });
}

// Filtros aplicados automaticamente, na linha do título. campos: empresa, camera, prefixo, periodo, mes. extra: HTML à direita.
export function barraFiltros(campos, aoFiltrar, extra = '') {
  const el = document.getElementById('topo-filtros');
  const tem = (k) => campos.includes(k);
  el.innerHTML = `<div class="filtros">
    <div class="campo"><label for="f-empresa">Empresa</label><select id="f-empresa" class="w200"><option value="">Todas</option><option value="${GRUPO_METROPOLE}" ${F.empresa === GRUPO_METROPOLE ? 'selected' : ''} title="Todas as empresas Metrópole">METROPOLE (todas)</option>${D.garagens.map((e) => `<option ${F.empresa === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
    <div class="campo"><label for="f-camera">Câmera</label><select id="f-camera" class="w170"><option value="">Todas</option>${D.cameras.map((c) => `<option value="${c}" ${F.camera === String(c) ? 'selected' : ''}>${esc(camNome(c))}</option>`).join('')}</select></div>
    ${tem('prefixo') ? `<div class="campo"><label for="f-prefixo">Prefixo</label><input id="f-prefixo" class="w120" type="search" inputmode="numeric" placeholder="Ex.: 10003" value="${esc(F.prefixo)}" /></div>` : ''}
    ${tem('periodo') ? `<div class="campo"><span class="rot" id="rot-periodo">Período</span><div id="f-periodo"></div></div>` : ''}
    ${tem('mes') ? `<div class="campo"><label for="f-mes">Mês</label><select id="f-mes" class="w170">${D.meses.slice().reverse().map((m) => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select></div>` : ''}
    ${extra ? `<div class="campo campo-extra">${extra}</div>` : ''}</div>`;
  const aplicar = async () => {
    F.empresa = el.querySelector('#f-empresa').value;
    F.camera = el.querySelector('#f-camera').value;
    if (tem('prefixo')) F.prefixo = el.querySelector('#f-prefixo').value.trim();
    if (tem('mes')) F.mes = el.querySelector('#f-mes').value;
    if (F.camera) await carregarCamera(F.camera);
    aoFiltrar();
  };
  if (tem('periodo')) {
    const montarCal = () => calendario(el.querySelector('#f-periodo'), { min: D.dias[0], max: D.dias[D.nd - 1], de: F.de, ate: F.ate, dias: new Set(D.dias) },
      (de, ate) => { F.de = de; F.ate = ate; montarCal(); aplicar(); });
    montarCal();
  }
  let espera = 0;
  el.querySelectorAll('select').forEach((i) => i.addEventListener('change', aplicar));
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
  document.body.dataset.aba = aba; // a Visão geral pode rolar verticalmente (tabela inteira visível); a Matriz não
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
