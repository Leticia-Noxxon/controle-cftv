// Como ler o painel: definições e premissas (as mesmas do README).
export function viewMetodologia(el, D) {
  const h = D.meta.janela_antes_h;
  el.innerHTML = `<section class="secao metodo"><h2>Como ler este painel</h2>
  <h3>Fontes</h3><ul>
    <li><strong>Monitoramento horário</strong> (exportações do BigQuery <code>bq-results-*.csv</code>): um registro por câmera aproximadamente a cada hora, com <code>status</code>, <code>sdcard</code>, <code>login</code> e <code>recording</code>.</li>
    <li><strong>Formulário de manutenção</strong> (<code>Revisão_CFTV…xlsx</code>): uma linha por visita técnica.</li>
    <li><strong>Relatório CFTV de 28/09</strong> (<code>Relatório CFTV - 28.09.2026.xlsx</code>): retrato consolidado do dia, usado como fonte complementar da situação atual (não entra na matriz nem nos cálculos de duração).</li></ul>
  <h3>Câmeras</h3><p>id_camera 1001 = câmera 21 (Frontal), 1002 = 22 (Frente), 1003 = 23 (Corredor 1), 1004 = 24 (Corredor 2), 1005 = 25 (Corredor 3), 1006 = 26 (Corredor 4). O id 1007 aparece em um único prefixo e é mostrado como “sem mapeamento”.</p>
  <h3>Estado de cada registro</h3><ul>
    <li><strong>Online</strong>: status online e SD, login e gravação “ok”.</li>
    <li><strong>Erro SD/gravação</strong> (falha técnica): status online, mas algum item em “error”. Nos dados, quase sempre SD e gravação juntos; login nunca aparece em erro.</li>
    <li><strong>Offline</strong>: status offline (SD/login/gravação vêm vazios).</li>
    <li><strong>Sem dados</strong>: nenhum registro — nunca é tratado como offline.</li></ul>
  <h3>Datas</h3><p>Os horários do BigQuery estão em UTC e foram convertidos para Brasília (UTC−3); a data de cada registro é a data em Brasília. O horário da manutenção é o campo “Data” do formulário (assumido como horário de Brasília); “Data de Envio” é só o momento do envio.</p>
  <h3>Matriz diária</h3><ul>
    <li>Número da célula = disponibilidade do dia = registros online sem erro ÷ todos os registros das câmeras do veículo no dia.</li>
    <li>Cor = quais estados ocorreram no dia (presença, não proporção): verde = só online; degradês = combinação de estados (ex.: verde→vermelho = houve online e offline); vermelho sólido = todos os registros do dia offline; laranja sólido = só erro.</li>
    <li>Faixa azul no topo = houve manutenção no dia. Azul é usado só para manutenção.</li>
    <li>Com o filtro de câmera, a cor mostra só os estados daquela câmera.</li></ul>
  <h3>Situação atual</h3><p>Estado do último registro de cada câmera. Câmeras sem registro no último dia da base aparecem com a data do último registro. Na visão “Relatório 28/09”, “-” = câmera não instalada (não conta).</p>
  <h3>Problemas em aberto (duração)</h3><ul>
    <li>Dia com problema = pelo menos um registro offline ou com erro no dia.</li>
    <li>A sequência atual termina no último dia com dados da câmera e volta enquanto os dias anteriores com dados também tiveram problema. Dias sem nenhum registro no meio não interrompem nem contam como problema (aparecem em “dias sem dados”).</li>
    <li><strong>Desde</strong> = horário do primeiro registro com problema no primeiro dia da sequência. Se a sequência começa em 31/08 (início dos dados), a duração real pode ser maior.</li>
    <li><strong>Dias corridos</strong> = do primeiro ao último dia da sequência, contando o calendário. <strong>Contínuo</strong> = nenhum registro online na sequência; <strong>intermitente</strong> = alternou.</li></ul>
  <h3>Manutenção: precisava? resolveu?</h3><ul>
    <li>Visita = formulários do mesmo prefixo no mesmo dia.</li>
    <li><strong>Precisava?</strong> Sim = algum registro offline/erro nas ${h} h antes do horário da visita; Não = todos online sem erro; Sem dados = nenhum registro nessa janela (ex.: visitas de agosto).</li>
    <li><strong>Depois</strong> = registros após o horário da visita até a próxima visita do mesmo prefixo ou até o fim dos dados.</li>
    <li><strong>Resolvido</strong>: todas as câmeras com problema antes tiveram um registro online sem erro depois e não voltaram a falhar. <strong>Resolvido com recorrência</strong>: normalizaram, mas voltaram a falhar (mesmo que por um registro). <strong>Parcialmente resolvido</strong>: só parte normalizou. <strong>Não resolvido</strong>: nenhuma normalizou. <strong>Sem problema antes</strong>: o CFTV estava normal antes. <strong>Sem dados para avaliar</strong>: falta registro antes ou depois.</li>
    <li><strong>Problema novo</strong>: câmera normal antes que teve problema depois.</li>
    <li>Problemas e ações do formulário: cada célula pode ter vários itens (separados por quebra de linha); eles são separados e padronizados. O texto original fica disponível no detalhe.</li></ul>
  <h3>O que não é feito</h3><ul><li>Nenhum dado é inventado ou estimado: onde não há registro aparece “sem dados”.</li><li>Não há ranking de técnicos.</li><li>O IP de envio do formulário não é publicado.</li></ul>
  </section>`;
}
