import '@fontsource/inter/400.css';
import './style.css';

const base = import.meta.env.BASE_URL;
const obter = (a) => fetch(`${base}data/${a}`).then((r) => { if (!r.ok) throw new Error(a); return r.json(); });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Number(n).toLocaleString('pt-BR');
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const POS = { 21: 'Frontal', 22: 'Frente', 23: 'Corredor 1', 24: 'Corredor 2', 25: 'Corredor 3', 26: 'Corredor 4' };
const camNome = (c) => (POS[c] ? `Câmera ${c} · ${POS[c]}` : `Câmera id ${c}`);
const catCod = (code) => (code === 'N' ? 'ok' : code === 'O' ? 'of' : 'fa');   // último estado: N online, O offline, 1-7 erro (SD)

const F = { empresa: '', camera: '', prefixo: '' };
const ORD = { k: 'garagem', dir: 1 };
let D;

// Cor do dia: cada câmera com registro no dia conta como "com problema" se teve ao menos um registro offline ou com erro.
// verde = nenhuma com problema; laranja = algumas; vermelho = todas as câmeras com registro no dia.
function corDia(v, i) {
  const cams = F.camera ? [F.camera] : Object.keys(v.k || {});
  let com = 0, prob = 0;
  cams.forEach((c) => { const m = Number(v.k?.[c]?.[i] || 0); if (m) { com += 1; if (m & 6) prob += 1; } });
  if (!com) return 'n';
  return prob === 0 ? 'v' : prob === com ? 'r' : 'l';
}

function filtrados() {
  const q = F.prefixo.split(/[\s,;]+/).filter(Boolean);
  return D.veiculos.filter((v) => (!F.empresa || v.empresa === F.empresa) && (!F.camera || v.c.includes(Number(F.camera)))
    && (!q.length || q.some((x) => String(v.p).includes(x))));
}

function cards(vs) {
  let ok = 0, sd = 0, of = 0, veic = 0;
  vs.forEach((v) => {
    let falha = false;
    Object.entries(v.u).forEach(([c, [code]]) => {
      if (F.camera && c !== F.camera) return;
      const k = catCod(code);
      if (k === 'ok') ok += 1; else { falha = true; if (k === 'of') of += 1; else sd += 1; }
    });
    if (falha) veic += 1;
  });
  const card = (cor, rot, val) => `<div class="card"><div class="rot"><span class="ponto" style="background:${cor}"></span>${rot}</div><div class="val">${fmtN(val)}</div></div>`;
  document.getElementById('cards').innerHTML = card('var(--verde)', 'Câmeras funcionais', ok) + card('var(--laranja)', 'Câmeras com erro de SD card', sd)
    + card('var(--vermelho)', 'Câmeras 100% offline', of) + card('#d1d5db', 'Veículos com falha', veic);
}

function matriz(vs) {
  const idx = D.idxDias;
  const cols = `160px 75px 90px repeat(${idx.length}, var(--passo)) 1fr`;
  const linhas = vs.map((v) => {
    const cores = idx.map((i) => corDia(v, i));
    const com = cores.filter((c) => c !== 'n').length;
    return { v, cores, disp: com ? (100 * cores.filter((c) => c === 'v').length) / com : null };
  });
  const val = { garagem: (r) => r.v.g || '\uffff', prefixo: (r) => r.v.p, disp: (r) => (r.disp == null ? 999 : r.disp) };
  linhas.sort((a, b) => {
    const x = val[ORD.k](a), y = val[ORD.k](b);
    const c = typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR', { numeric: true });
    return (c || a.v.p - b.v.p) * (c ? ORD.dir : 1);
  });
  const seta = (k) => (ORD.k === k ? (ORD.dir > 0 ? ' ↑' : ' ↓') : '');
  const el = document.getElementById('matriz');
  el.innerHTML = `<div class="mw" id="mw"><div class="linha cab" style="grid-template-columns:${cols};width:max-content;min-width:100%">
      <div class="fixa f1 ord" data-o="garagem">Garagem${seta('garagem')}</div><div class="fixa f2 ord" data-o="prefixo">Prefixo${seta('prefixo')}</div><div class="fixa f3 ord" data-o="disp">Disponibilidade${seta('disp')}</div>
      ${idx.map((i) => `<div class="dia">${D.dias[i].slice(8, 10)}</div>`).join('')}<div></div></div>
    <div class="corpo" id="corpo" style="position:relative;height:${linhas.length * 26}px"></div></div>${linhas.length ? '' : '<div class="vazio">Nenhum veículo.</div>'}`;
  el.querySelectorAll('.ord').forEach((h) => h.addEventListener('click', () => { const k = h.dataset.o; ORD.dir = ORD.k === k ? -ORD.dir : 1; ORD.k = k; matriz(vs); }));
  const mw = el.querySelector('#mw'); const corpo = el.querySelector('#corpo');
  const desenhar = () => {
    const topo = Math.max(0, Math.floor((mw.scrollTop - 32) / 26) - 10);
    const n = Math.ceil(mw.clientHeight / 26) + 20;
    corpo.innerHTML = linhas.slice(topo, topo + n).map((r, j) => `<div class="linha" style="grid-template-columns:${cols};position:absolute;top:${(topo + j) * 26}px;width:max-content;min-width:100%" data-p="${r.v.p}">
      <div class="fixa f1">${esc(r.v.g || '—')}</div><div class="fixa f2">${r.v.p}</div><div class="fixa f3">${r.disp == null ? '—' : `${r.disp.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}</div>
      ${idx.map((i, k) => `<div><div class="q ${r.cores[k]}" data-i="${i}">${r.v.mv[i] ? '<span class="dot"></span>' : ''}</div></div>`).join('')}<div></div></div>`).join('');
  };
  desenhar();
  mw.addEventListener('scroll', () => requestAnimationFrame(desenhar));
  const pop = document.getElementById('pop');
  corpo.addEventListener('mouseover', (e) => {
    const dot = e.target.closest('.dot');
    if (!dot || pop.classList.contains('fixo')) return;
    mostrarPop(dot, false);
  });
  corpo.addEventListener('mouseout', (e) => { if (e.target.closest('.dot') && !pop.classList.contains('fixo')) pop.style.display = 'none'; });
  corpo.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot');
    if (dot) { e.stopPropagation(); mostrarPop(dot, true); return; }
    const q = e.target.closest('.q');
    if (!q || q.classList.contains('n')) return;
    fecharPop();
    abrirDia(Number(q.closest('.linha').dataset.p), Number(q.dataset.i));
  });
}

function resumoManut(e) {
  const forms = e.forms.map((id) => D.formPorId.get(id)).filter(Boolean);
  return forms.map((f) => {
    const pos = f.posicoes.filter((p) => p.problemas.length || p.acoes.length);
    const probs = pos.filter((p) => p.problemas.length).map((p) => `${p.camera ? `Câm ${p.camera}` : esc(p.posicao)}: ${esc(p.problemas.map((x) => x.item).join(', '))}`);
    const acoes = pos.filter((p) => p.acoes.length).map((p) => `${p.camera ? `Câm ${p.camera}` : esc(p.posicao)}: ${esc(p.acoes.map((x) => x.item).join(', '))}`);
    return `<div class="item"><p>${dmy(f.data)} ${f.hora} · ${esc(f.tecnico)}</p>
      <p><span class="sub">Problemas</span> ${probs.join(' · ') || '—'}</p>
      <p><span class="sub">Ações</span> ${acoes.join(' · ') || '—'}</p>
      <p><span class="sub">Câmeras</span> ${esc(f.cameras_formulario.join(', ') || '—')}</p></div>`;
  }).join('');
}

function mostrarPop(dot, fixo) {
  const v = D.porPrefixo.get(Number(dot.closest('.linha').dataset.p));
  const i = Number(dot.parentElement.dataset.i);
  const pop = document.getElementById('pop');
  pop.innerHTML = (v.mv[i] || []).map((k) => resumoManut(D.eventos[k])).join('');
  pop.classList.toggle('fixo', fixo);
  pop.style.display = 'block';
  const r = dot.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.right + 8, innerWidth - w - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.top - 4, innerHeight - h - 8))}px`;
}
function fecharPop() { const p = document.getElementById('pop'); p.style.display = 'none'; p.classList.remove('fixo'); }

const cacheDet = new Map();
const detalhe = (p) => {
  const k = String(p % 64).padStart(2, '0');
  if (!cacheDet.has(k)) cacheDet.set(k, obter(`detalhe/${k}.json`));
  return cacheDet.get(k).then((d) => d[String(p)] || {});
};

async function abrirDia(p, i) {
  const v = D.porPrefixo.get(p); const dia = D.dias[i];
  const evs = (v.mv[i] || []).map((k) => D.eventos[k]);
  const corpo = document.getElementById('painel-corpo');
  const render = (det) => {
    const cams = v.c.map((c) => {
      const segs = det?.[c]?.[dia] || [];
      const n = { ok: 0, fa: 0, of: 0 };
      segs.forEach(([, , code, q]) => { n[catCod(code)] += q; });
      const tot = n.ok + n.fa + n.of;
      let txt;
      if (!det) txt = '…';
      else if (!tot) txt = 'Sem registro';
      else {
        const partes = [['ok', 'Online', 'var(--verde)'], ['fa', 'Erro de SD card', 'var(--laranja)'], ['of', 'Offline', 'var(--vermelho)']].filter(([k]) => n[k]);
        txt = partes.length === 1 ? `<span class="ponto" style="background:${partes[0][2]}"></span>${partes[0][1]}`
          : partes.map(([k, nome, cor]) => `<span class="ponto" style="background:${cor}"></span>${nome} ${Math.round((100 * n[k]) / tot)}%`).join(' ');
      }
      return `<div class="cam"><span>${esc(camNome(c))}</span><span class="est">${txt}</span></div>`;
    }).join('');
    corpo.innerHTML = `<p class="tit">Prefixo ${p} · ${dmy(dia)}</p><p class="sub">${esc(v.empresa)}${v.g ? ` · ${esc(v.g)}` : ''}</p>
      <div class="bloco"><div class="lbl">Câmeras</div>${cams}</div>
      ${evs.length ? `<div class="bloco"><div class="lbl">Manutenção</div>${evs.map(resumoManut).join('')}</div>` : ''}`;
  };
  render(null);
  const painel = document.getElementById('painel');
  painel.classList.add('aberto'); painel.setAttribute('aria-hidden', 'false');
  const det = await detalhe(p);
  if (document.querySelector('#painel-corpo .tit')?.textContent === `Prefixo ${p} · ${dmy(dia)}`) render(det);
}
function fecharPainel() { const p = document.getElementById('painel'); p.classList.remove('aberto'); p.setAttribute('aria-hidden', 'true'); }

function atualizar() { const vs = filtrados(); cards(vs); matriz(vs); }

async function iniciar() {
  const [meta, frota, man] = await Promise.all([obter('meta.json'), obter('frota.json'), obter('manutencoes.json')]);
  const comDado = new Set(meta.cobertura.map((c) => c.data));
  D = { dias: frota.dias, eventos: man.eventos, formPorId: new Map(man.formularios.map((f) => [f.id, f])) };
  D.idxDias = frota.dias.map((d, i) => i).filter((i) => comDado.has(frota.dias[i]));
  D.veiculos = frota.veiculos.map((v) => ({ ...v, empresa: v.e == null ? '—' : frota.empresas[v.e] }));
  D.porPrefixo = new Map(D.veiculos.map((v) => [v.p, v]));
  const selE = document.getElementById('f-empresa');
  selE.innerHTML += frota.empresas.map((e) => `<option>${esc(e)}</option>`).join('');
  const cams = [...new Set(D.veiculos.flatMap((v) => v.c))].sort((a, b) => a - b);
  document.getElementById('f-camera').innerHTML += cams.map((c) => `<option value="${c}">${esc(camNome(c))}</option>`).join('');
  let t;
  [['empresa', 'change'], ['camera', 'change'], ['prefixo', 'input']].forEach(([k, ev]) => document.getElementById(`f-${k}`).addEventListener(ev, (e) => {
    F[k] = e.target.value.trim(); clearTimeout(t); t = setTimeout(atualizar, k === 'prefixo' ? 200 : 0);
  }));
  document.getElementById('fechar').addEventListener('click', fecharPainel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharPainel(); fecharPop(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('#pop') && !e.target.closest('.dot')) fecharPop(); });
  atualizar();
}
iniciar().catch((e) => { document.getElementById('matriz').innerHTML = `<div class="vazio">Não foi possível carregar os dados (${esc(e.message)}).</div>`; });
