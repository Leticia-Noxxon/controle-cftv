// Qualidade dos dados: cobertura por dia, verificações e o que foi tratado.
import { esc, dmy, dmyh, fmtN, camNome, tabela } from '../util.js';

export function viewQualidade(el, D) {
  const q = D.meta.qualidade; const m = D.meta.monitoramento; const f = D.meta.formulario; const r = D.meta.relatorio;
  const extra = q.camera_fora_do_mapeamento || [];
  const multi = q.prefixos_com_mais_de_uma_empresa || [];
  el.innerHTML = `<section class="secao"><h2>Qualidade dos dados</h2>
    <div class="grade g2">
      <div class="card"><h3>Monitoramento horário (BigQuery)</h3><dl class="pares">
        <dt>Arquivos</dt><dd>${m.arquivos.map(esc).join('<br>')}</dd>
        <dt>Registros lidos</dt><dd>${fmtN(m.registros_brutos)}</dd>
        <dt>Duplicados idênticos removidos</dt><dd>${fmtN(q.duplicados_identicos_removidos)}</dd>
        <dt>Registros usados</dt><dd>${fmtN(m.registros_validos)}</dd>
        <dt>Período (Brasília)</dt><dd>${dmyh(m.inicio)} a ${dmyh(m.fim)}</dd>
        <dt>Prefixos / câmeras</dt><dd>${fmtN(m.prefixos)} / ${fmtN(m.cameras)}</dd>
        <dt>Timestamp inválido</dt><dd>${fmtN(q.timestamp_invalido)}</dd>
        <dt>Prefixo ausente/inválido</dt><dd>${fmtN(q.prefixo_ausente_ou_invalido)}</dd>
        <dt>Combinação de status não prevista</dt><dd>${fmtN(q.combinacao_status_nao_prevista)}</dd>
        <dt>Latitude/longitude preenchidas</dt><dd>${fmtN(q.latitude_longitude_preenchidas)} (colunas vazias em todo o arquivo)</dd>
        <dt>Câmera fora do mapeamento 1001–1006</dt><dd>${extra.length ? extra.map((x) => `id ${x[0]}: ${fmtN(x[1])} registros, prefixo(s) ${x[2].join(', ')} (${x[3].join(', ')}) — exibida como “${esc(camNome(x[0]))}”`).join('<br>') : 'nenhuma'}</dd>
        <dt>Prefixos com mais de uma empresa</dt><dd>${fmtN(multi.length)} (usada a empresa do registro mais recente)</dd></dl></div>
      <div class="card"><h3>Combinações de status encontradas</h3><div class="tabela-wrap"><table class="tab"><thead><tr><th>status</th><th>sdcard</th><th>login</th><th>recording</th><th>Classificação</th><th class="num">Registros</th></tr></thead><tbody>
        ${q.combinacoes_status.map((c) => `<tr><td>${esc(c[0])}</td><td>${esc(c[1] ?? '(vazio)')}</td><td>${esc(c[2] ?? '(vazio)')}</td><td>${esc(c[3] ?? '(vazio)')}</td><td>${c[4] === 'N' ? 'Online' : c[4] === 'O' ? 'Offline' : 'Erro SD/gravação (falha técnica)'}</td><td class="num">${fmtN(c[5])}</td></tr>`).join('')}</tbody></table></div>
        <h3 style="margin-top:1rem">Formulário de manutenção</h3><dl class="pares"><dt>Arquivo / aba</dt><dd>${esc(f.arquivo)} / ${esc(f.aba_utilizada)}</dd><dt>Linhas</dt><dd>${fmtN(f.linhas)}</dd>
        <dt>Linhas no layout antigo</dt><dd>${fmtN(f.realinhadas)} — colunas deslocadas uma posição (sem “Data de Envio”); realinhadas</dd><dt>Duplicadas</dt><dd>${fmtN(f.duplicadas)} — cópias idênticas de respostas já presentes; descartadas</dd>
        <dt>Formulários válidos</dt><dd>${fmtN(f.formularios_validos)} (${fmtN(f.eventos)} visitas prefixo + dia)</dd></dl>
        ${r ? `<h3 style="margin-top:1rem">Relatório CFTV diário</h3><dl class="pares"><dt>Arquivo / aba</dt><dd>${esc(r.arquivo)} / ${esc(r.aba)}</dd><dt>Data</dt><dd>${dmy(r.data)}</dd><dt>Prefixos</dt><dd>${fmtN(r.prefixos)} (${fmtN(r.prefixos_sem_monitoramento)} não aparecem no monitoramento)</dd></dl>` : ''}</div>
    </div></section>
    <section class="secao"><h3>Cobertura por dia (horário de Brasília)</h3><p class="nota">O BigQuery registra em UTC; a conversão para Brasília (UTC−3) desloca 3 h. Dias parciais: 31/08 começa às 21h; 14/09 termina às 20h59; o dia 15/09 UTC não está na base, então 15/09 em Brasília só tem 21h–23h59; 24/09 termina às 20h59. Dias sem dados ficam cinza na matriz — nunca contam como offline.</p><div id="t-cob"></div></section>`;
  tabela(el.querySelector('#t-cob'), {
    linhas: m && D.meta.cobertura, ordem: { k: 'data', dir: 1 }, porPagina: 60,
    cols: [{ k: 'data', t: 'Data', r: (c) => dmy(c.data) }, { k: 'inicio', t: 'Primeiro registro', r: (c) => c.inicio.slice(11, 16) }, { k: 'fim', t: 'Último registro', r: (c) => c.fim.slice(11, 16) },
      { k: 'horas', t: 'Horas com dados', num: true, r: (c) => `${c.horas}${c.horas < 24 ? ' <span class="chip c-nd">parcial</span>' : ''}` }, { k: 'prefixos', t: 'Prefixos', num: true, r: (c) => fmtN(c.prefixos) }, { k: 'registros', t: 'Registros', num: true, r: (c) => fmtN(c.registros) }],
  });
}
