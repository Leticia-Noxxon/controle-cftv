# Controle de CFTV

Painel estático (Vite + JavaScript, sem framework) publicado no GitHub Pages: https://leticia-noxxon.github.io/controle-cftv/

Duas páginas, sem recarregar (rota por `#`):

- **Monitoramento** (`/`): cabeçalho (última atualização = horário do registro mais recente dos dados), filtros, 4 cards, tabela Garagem × Prefixo × Disponibilidade × datas (uma única tabela com rolagem), painel de detalhe e legenda. Botão `›` no canto → Estatísticas.
- **Estatísticas** (`#estatisticas`): ranking de conexão das câmeras (por empresa) e ranking de manutenção (por garagem). Botão `‹` volta ao monitoramento.

## Página 1 — Monitoramento

- **Filtros** (combinam entre si; aplicados **automaticamente**: Empresa, Câmera e Período na mudança, Prefixo enquanto digita, com espera de 300 ms; não há botão Filtrar): Empresa, Câmera, Prefixo (parte do número ou lista separada por vírgula) e Período (data inicial–final, limitado às datas presentes nos dados). Não há filtro de Garagem (a garagem continua na tabela); ele volta só se mais de 90 % dos prefixos tiverem garagem (hoje 52,7 %).
  - **Empresa → METROPOLE**: opção extra que agrupa todas as empresas cujo nome contém “METROPOLE” (sem diferenciar maiúsculas/acentos): METROPOLE - AE CARVALHO, METROPOLE - EXPANDIR, METROPOLE - IGUATEMI, METROPOLE - IMPERADOR, METROPOLE - ITAIM, METROPOLE - MBOI - MIRIM e METROPOLE PAULISTA - DEPINEDO. As empresas individuais continuam na lista.
- **Clique no card** filtra a tabela aos veículos daquele card (novo clique limpa; card ativo com fundo `#EFF6FF` e borda azul). Combina com os demais filtros; os números dos cards continuam refletindo só os outros filtros. Veículos mostrados: *Câmeras funcionais* = veículos com ao menos uma câmera funcional; *Erro de SD card* = veículos com alguma câmera com erro de SD; *100% offline* = veículos com alguma câmera offline; *Veículos com falha* = exatamente os veículos contados no card (erro de SD ou offline). Sempre pelo último registro de cada câmera no período.
- **Cards** (estado do **último registro de cada câmera dentro do período filtrado**; % sobre as câmeras filtradas):
  - *Câmeras funcionais* = último registro online com SD/login/gravação ok.
  - *Câmeras com erro de SD card* = último registro online com SD em erro (nos dados, sempre SD + gravação).
  - *Câmeras 100% offline* = último registro offline.
  - *Veículos com falha* (unidade: veículos; os três primeiros contam câmeras) = prefixos com pelo menos uma câmera filtrada com erro de SD ou offline no último registro.
- **Tabela**: Garagem (190 px), Prefixo (85 px), Disponibilidade (105 px) e uma coluna por data. As datas vêm dos próprios dados (datas distintas dos registros, em Brasília), nunca de uma lista fixa. As colunas de data dividem toda a largura restante (mínimo 28 px); se não couberem, só a área das datas rola na horizontal, com as 3 primeiras colunas e o cabeçalho fixos. A altura da tabela acompanha a janela. Clique em Garagem/Prefixo/Disponibilidade para ordenar. **Sem paginação**: todos os veículos ficam na mesma tabela e basta rolar até o fim; por desempenho, a rolagem é **virtual** (só as linhas visíveis + 12 acima/abaixo são desenhadas; espaçadores mantêm a altura total). A contagem “N veículos” fica abaixo, à direita.
- **Cor da célula** (sem texto), a partir de **todos os registros horários do dia**, considerando as câmeras (filtradas) que têm registro no dia:

  | Situação | Cor | Legenda |
  |---|---|---|
  | Todas as câmeras online, sem erro, em todos os registros do dia | Verde `#22C55E` | Todo online |
  | Todas as câmeras offline em todos os registros do dia | Vermelho `#EF4444` | Todo offline |
  | Qualquer outro caso com dados: alguma câmera com erro de SD, offline só em parte dos registros ou variação ao longo do dia | Âmbar `#F59E0B` | Erro SD ou variação |
  | Nenhum registro no dia | Cinza `#CBD5E1` (nunca conta como offline) | Sem dados |

  Com **uma câmera** no filtro, a mesma regra vale para essa câmera (verde = todos os registros online; vermelho = todos offline; âmbar = o resto). Os selos das câmeras no painel seguem a mesma regra.
- **Ponto azul** (6 px, canto superior direito) = há formulário de manutenção do veículo naquele dia (“Manutenção registrada”). Tooltip da célula: data, câmeras, disponibilidade do dia, tempo online, tempo offline e Manutenção Sim/Não.
- **Disponibilidade** (coluna e tooltip) = tempo online ÷ tempo monitorado no período, com as câmeras filtradas. **Tempo monitorado exclui “Sem dados”**; erro de SD conta como não disponível.
- **Painel de detalhe** (clique na célula): abre à direita (grade `3fr / minmax(320px, 1fr)`); fechado, a tabela volta a 100 % da largura. Abaixo de 1024 px vira gaveta sobreposta. Mostra prefixo, data, empresa e garagem; lista de câmeras com o estado do dia; para a câmera escolhida: disponibilidade do dia, tempos online/offline/falha/sem dados, **linha do tempo** e os **formulários de manutenção** do dia (Data/hora e técnico, Problema e Ação em até 3 linhas, “Ver registro completo” com o texto original do formulário, carregado sob demanda).

### Linha do tempo (como é calculada)
1. Registros da câmera ordenados por horário (UTC → Brasília). Estado de cada registro: Online (tudo ok), Falha (online com SD/gravação em erro), Offline.
2. A coleta é **aproximadamente horária** (mediana entre registros 60,1 min; 96 % dos intervalos entre 55 e 65 min). Cada registro vale **do seu horário até o próximo registro da mesma câmera**, se o próximo vier em até **65 min**; se vier depois (ou não houver próximo), o registro vale só **60 min** e o resto fica **Sem dados**. O último registro não passa do fim da extração. Intervalos que atravessam a meia-noite são divididos entre os dois dias (por isso o dia pode começar com o último registro do dia anterior).
3. Intervalos consecutivos com o mesmo estado e sem lacuna são unidos; mudança de estado ou lacuna inicia outro trecho. Lacunas = Sem dados (cinza).
4. Início/fim mostram o horário do registro (HH:mm); as durações são arredondadas a 5 min, porque a resolução da fonte é de ~1 h — um trecho não indica o minuto exato da mudança, só que ela ocorreu entre dois registros.
5. Em dias parciais da extração (31/08, 14/09, 15/09 e 28/09) o horário fora da extração aparece como Sem dados e o painel avisa.

### Texto de manutenção no painel
Quebras `<br>`/linhas/`;` viram itens; removem-se marcadores, linhas vazias, frases padrão (“Nenhuma anomalia identificada”, “Nenhuma ação realizada”) e repetições. Nada é reescrito: números de câmera, componentes, cabo, SD, UCP, TDM etc. ficam como o técnico escreveu. **Ação** prioriza a observação final do técnico; se não houver, usa as ações marcadas no formulário. Linhas longas são cortadas com “…” (o texto completo fica em “Ver registro completo”).

## Página 2 — Estatísticas
Filtros Empresa (com a opção METROPOLE), Câmera e Período (afetam tudo).
- **Ranking de conexão das câmeras** (só dados de monitoramento), uma linha por empresa real, ordenado pela menor disponibilidade de conexão: disponibilidade = tempo online ÷ tempo monitorado no período (mesma regra da página 1, sem “Sem dados”); câmeras com falha e veículos com falha = mesma definição dos cards (último registro da câmera no período offline ou com erro de SD).
- **Ranking de manutenção** (formulário + análise antes/depois do pipeline): uma linha por **garagem do formulário**, com **contagem de veículos** (prefixos distintos), ordenada por *Veículos com manutenção* (decrescente), e uma linha Total. Cada veículo entra na garagem do seu formulário mais recente no período (o Total não duplica).
  - *Veículos com manutenção* = ao menos uma visita no período (visita = formulários do mesmo prefixo no mesmo dia).
  - *Com reincidência* = manutenção em dois ou mais dias diferentes no período.
  - *Precisavam* = ao menos uma visita em que o monitoramento mostrou câmera offline ou com erro de SD na janela **do início (00:00) do dia anterior até o horário da visita** (cobre o dia da visita antes do horário e o dia anterior inteiro).
  - *Resolvidos (sem recorrência)* = dos que precisavam, a última visita necessária foi classificada como **Resolvido** (todas as câmeras com problema antes voltaram ao normal depois da visita e não falharam de novo até a próxima visita ou o fim dos dados). “Resolvido com recorrência” **não** conta.
  - Filtros: Período pela data da visita; Câmera = visitas que citam a câmera; Empresa = empresa do prefixo no monitoramento (visitas de prefixos fora do monitoramento saem quando há filtro de empresa).

## Versão v2 (layout alternativo)

https://leticia-noxxon.github.io/controle-cftv/v2/ usa o estilo do "Property Management Dashboard UI Kit" (Paperpillar) e os mesmos dados da versão principal (`../data/`). A versão principal não muda.

- **Layout:**
  - Título "Controle de CFTV" com os filtros na mesma linha, à direita (Empresa, Câmera, Prefixo, Período / Mês).
  - Sem subtítulos. "Última atualização" é um texto discreto no canto inferior direito, com espaço reservado para não cobrir o conteúdo. Na Matriz fica fixo; na Visão geral fica no fim da página.
  - A Matriz ocupa a tela fixa (100dvh). A Visão geral pode rolar verticalmente para a tabela aparecer inteira, sem rolagem interna.
  - A barra lateral tem duas abas, com dica ao passar o mouse, focar ou tocar e segurar. No celular ela vai para baixo.
- **Período:** calendário próprio em popover, em pt-BR.
  - Dois cliques escolhem um intervalo; dois cliques no mesmo dia escolhem um dia só.
  - Atalhos Último dia e Últimos 7 dias, além de Limpar (também pelo × do campo).
  - Só os dias com dados podem ser escolhidos.
- **Garagem/Empresa:** a garagem de cada veículo é a empresa do registro mais recente do prefixo, normalizada pelas tabelas `MAPA_EMPRESA` e `MAPA_FORMULARIO` em `site/v2/src/dados.js`.
  - Não existe "Não informado".
  - Via Sudeste Cursino e Sapopemba viram "Via Sudeste".
  - O filtro se chama "Empresa" e mantém a opção "METROPOLE (todas)".
- **Status do dia (Matriz), por veículo, ou só pela câmera escolhida no filtro:**

  | Status | Regra | Cor |
  |---|---|---|
  | Funcional | todos os registros do dia online e sem erro | verde |
  | 100% Offline | todos os registros do dia offline | vermelho |
  | Erro de SD | nenhum registro offline, mas algum com erro de SD card (a câmera está online) | roxo claro `#C7B8F5` |
  | 1+ câm. com problema | há registro offline, mas não todos (conexão parcial ou variação) | âmbar |
  | Sem conexão | nenhum registro no dia | cinza |

- **Situação atual (Visão geral):** vale o último registro de cada câmera no período. É uma partição dos veículos:
  - **Funcionais:** todas as câmeras funcionais.
  - **1+ câm. c/ falha:** uma ou mais câmeras offline, mas não todas; pode haver erro de SD junto.
  - **100% offline:** todas as câmeras offline.
  - **Erro SD:** nenhuma câmera offline e uma ou mais com erro de SD.
  - **Sem conexão:** nenhum registro no período (a coluna só aparece quando houver algum).
  - O card "Veículos com falha" é a soma de 1+ câm. c/ falha, 100% offline e Erro SD.
- **Aba Visão geral:**
  - **Cards:** número alinhado à esquerda com o texto do título.
    - Variação em relação ao dia anterior no canto superior direito ("↑ 126"), com cor semântica: verde quando melhora (mais câmeras funcionais; menos offline, erro de SD ou falhas) e vermelho quando piora.
    - A base fica na dica: fechamento do último dia do período (ou dos dados) contra o do dia anterior.
    - Clicar num card filtra a tabela.
  - **Tabela "Conexão por Empresa"** (sem título visível): compacta e leve, com números centralizados em cinza, zeros em cinza-claro, só linhas horizontais suaves e pontos coloridos discretos nos cabeçalhos de status. Cabe inteira na tela em 1920×1080 e 1366×768.
    - A coluna Empresa e o total (Veículos ou Câmeras) ficam sempre visíveis.
    - Três blocos com chave própria, cada um com um tom de fundo suave:
      - **Situação atual** (branco, sem rótulo de grupo, ligado por padrão): Funcionais, 1+ câm. c/ falha, 100% offline, Erro SD. Os nomes são os mesmos no modo Câmera; nele, 1+ câm. c/ falha conta as câmeras offline de veículos parcialmente offline, e 100% offline as câmeras de veículos todo offline.
      - **Falha por posição** (#FAFAF8, ligado por padrão): 21 a 26.
      - **Manutenção** (#F7FAFD, desligado por padrão): Atendidos, Reincidências, Procedentes, Solucionados, Improcedentes.
    - Definições completas nas dicas dos cabeçalhos; ordenação, linha Total e exportação para Excel da visão atual.
    - **Clique num número de Falha por posição:** abre um modal só com os veículos da empresa (ou de todas, na linha Total) com aquela câmera em falha. Mostra prefixo, status, dias com problema, último registro e última manutenção resumida, com botão Exportar Excel.
  - **Clique no nome da empresa:** abre um modal com o gráfico de evolução diária da empresa.
    - Séries: Funcional `#2F9E62`, 1+ câm. com problema `#E08A00`, Erro de SD `#7C5CD6` e 100% Offline `#D64545`.
    - Mostra área, grade, eixos, legenda, dica com os valores do dia e alterna Veículo | Câmera.
    - A aba "Veículos" do modal traz a lista de veículos, com a linha do tempo e a manutenção de cada um.
  - **Clique no resto da linha:** abre direto a lista de veículos.
- **Aba Matriz:**
  - Filtros Empresa, Câmera e Mês (padrão: o mês mais recente), mais o botão OS, na linha do título.
  - **Filtro de status**, múltiplo; os chips também servem de legenda: Funcional, 100% Offline, Erro de SD, 1+ câm. com problema, Sem conexão e Manutenção. Ficam os veículos com pelo menos um dia no mês com algum dos status marcados.
  - **Com uma câmera escolhida,** as células, a dica e o painel de detalhe mostram só essa câmera. As manutenções também se limitam às que citam a câmera ou não informam câmera.
  - A matriz ocupa a altura toda, com rolagem virtual, ponto azul de manutenção e painel de detalhe.
- **OS (Ordem de Serviço, .xlsx):** gerada no navegador pelo botão **OS** (ExcelJS, carregado só na hora).
  - **Filtros:** Empresa, Câmera e Problema. O Problema segue a mesma partição da Visão geral; o padrão é 1+ câmera com problema, Erro de SD e 100% Offline.
  - **Planilha:** uma aba só, e a tabela começa na linha 1.
  - **Colunas:** Prioridade, Garagem/Empresa, Prefixo, Câm 21 a Câm 26, Observação técnica e Última manutenção. Com uma câmera escolhida, só a coluna, a observação e a última manutenção dessa câmera.
  - **Status das câmeras** em texto, sem cor: Funcional, Erro SD, Offline, Variação (funcional agora, com falha nos últimos 7 dias) e Sem conexão (sem registro nas 24 h antes da atualização).
  - **Formato:** Calibri 10, sem bordas, tudo centralizado exceto Observação técnica e Última manutenção (à esquerda, com quebra); cabeçalho em negrito com fundo claro, congelado, autofiltro, larguras ajustadas e A4 paisagem ajustado à largura.
  - **Última manutenção:** "data – Problema: … Ação: …", reescrita sem mudar o sentido:
    - corrige erros de digitação comuns (camera → câmera, swicth → switch, nescessário → necessário…);
    - corrige a caixa alta;
    - remove ruído (prefixo repetido no início, "ANOMALIAS", "+N item(ns)");
    - agrupa códigos C1…C6;
    - corta textos longos com "…".
- **Prioridade da OS:** três faixas; a planilha vem ordenada por faixa e, dentro dela, por dias com problema.
  - **Alta:** 100% offline (ou, com uma câmera escolhida, a câmera offline) ou problema há 7 dias ou mais.
  - **Média:** problema há 3 a 6 dias.
  - **Baixa:** problema há menos de 3 dias.
  - **Dias com problema:** a sequência atual de dias com offline/erro de SD da câmera com o problema mais longo, contada do último dia com registro para trás. Um dia sem registro não interrompe nem conta; um dia 100% funcional encerra a sequência.
  - **Desempate:** 100% offline antes de parcial, depois mais câmeras afetadas.
- **`site/v2/public/os.json`:** gerado por `scripts/gerar_v2_os.py`, que roda no fim de `atualizar_dados.py`. Guarda o último registro (data/hora) e o nº de mudanças de estado nos últimos 7 dias por prefixo e câmera.
- **Build:** `npm run build` gera a raiz e depois `dist/v2/` (`vite.v2.config.js`).
- **Validação:** `python tests/capturas_v2.py http://localhost:4174/v2/ local_v2`. Confere 1920×1080, 1366×768 e 390×844 (Matriz sem rolagem; Visão geral sem rolagem horizontal) e gera `docs/OS_exemplo_todas.xlsx` e `docs/OS_exemplo_cam21.xlsx`.

## Garagem
- Fontes: formulário de manutenção (`Revisão_CFTV…`, coluna Garagem) e, **só para garagem**, as exportações Jotform em `data/raw/garagens/`: `jotform_responses.xlsx` (de `C:\Automação Jotform\data\`, abas registro_de_configuracao, revisao_tecnica, revisao_cftv e gerenciamento_de_servico, 07/2025 a 09/2026) e `Revisão_CFTV2026-09-30_07_52_29.xlsx` (Downloads). Elas ficam fora de `data/raw/` para não trocar o formulário usado nas manutenções.
- Verificadas e **não usadas**: CSVs do monitoramento e Relatório CFTV 28/09 (sem coluna de garagem); `ListaAVL`, `relatorio_armazenamento_ucps_*` e Relatórios CFTV de março (coluna “garagem” no nível da empresa, ex.: “VIA SUDESTE” sem Cursino/Sapopemba — equivale à empresa); `Tecnologia Geral.xlsx` (01/2026, nomes diferentes e só 75 % de concordância em Cursino/Sapopemba; Brás × Iguatemi divergente).
- `scripts/pipeline/garagens.py`: trim, espaços colapsados, NFC, reparo de acentuação corrompida (“ViaþÒo Metr¾pole” → “Viação Metrópole”), nulos (`''`, `-`, `N/A`, `null`…) descartados. Por prefixo vence o valor válido **mais recente** (data do formulário); empate: formulário > Jotform > relatório > monitoramento. Conflitos contados no log e gravados em `data/processed/garagens_conflitos.json` (51 hoje, quase todos veículos que mudaram de garagem).
- Concordância Jotform × formulário: 581/581 prefixos com o mesmo valor final; 1.356/1.366 registros (99,3 %).
- Cobertura: **2.948 de 5.598 prefixos monitorados (52,7 %)**, antes 581 (10,4 %). Os demais mostram “Não informado”: nenhuma fonte informa a garagem. A garagem nunca é deduzida da empresa.

## Fontes de dados

| Arquivo | O que é | Uso |
|---|---|---|
| `bq-results-20260928-132402-….csv` (01–14/09 UTC), `bq-results-20260928-132836-….csv` (16–24/09 UTC) e `bq-results-20260930-020631-….csv` (25–28/09 UTC) | Monitoramento horário exportado do BigQuery (um registro por câmera ≈ a cada hora) | Cards, tabela, linha do tempo, estatísticas, duração dos problemas, antes/depois das manutenções |
| `Revisão_CFTV2026-09-11_13_40_20.xlsx` | **Formulário de manutenção** (uma linha por visita) | Manutenções |
| `Relatório CFTV - 28.09.2026.xlsx` | **Relatório CFTV diário de 28/09/2026** (retrato consolidado do dia, por prefixo) | Verificado como fonte de garagem (não tem a coluna) |

> Observação: no pedido original, o `Revisão_CFTV…` foi descrito como dados das câmeras e o `Relatório CFTV…` como formulário de manutenção. Pelo conteúdo, os papéis são o inverso; o painel usa cada arquivo pelo que ele contém.

Os arquivos brutos **não são versionados** (ficam em `data/raw/`, ignorado pelo git). As somas SHA-256 dos arquivos usados estão em `data/CHECKSUMS_SHA256_raw.txt`.

## Premissas e regras dos dados

### Câmeras
`id_camera` 1001 = câmera 21 (Frontal), 1002 = 22 (Frente), 1003 = 23 (Corredor 1), 1004 = 24 (Corredor 2), 1005 = 25 (Corredor 3), 1006 = 26 (Corredor 4). O `id_camera` 1007 aparece em um único prefixo (6001, NOXXONSAT; 4.839 registros) e é exibido como “id 1007 (sem mapeamento)”.

### Estado de cada registro do monitoramento
| status | sdcard | login | recording | Estado no painel |
|---|---|---|---|---|
| online | ok | ok | ok | **Online** |
| online | error (qualquer item) | … | … | **Erro SD/gravação** (falha técnica). Nos dados: SD + gravação em erro (710.462 registros); só gravação em erro (1 registro); login nunca em erro |
| offline | (vazio) | (vazio) | (vazio) | **Offline** |
| sem registro | | | | **Sem dados** — nunca conta como offline |

“Erro de cartão SD” nos indicadores = câmera online com SD (e gravação) em erro.

### Datas e horários
- O `timestamp` do BigQuery está em **UTC**; tudo foi convertido para **horário de Brasília (UTC−3)** e a data de cada registro é a data em Brasília.
- Período disponível: **31/08/2026 21:00 a 28/09/2026 20:59** (Brasília), **29 datas**. Dias parciais: 31/08 (só 21h–23h59), 14/09 (até 20h59), **15/09 (só 21h–23h59 — o dia 15/09 UTC não está em nenhuma exportação)** e 28/09 (até 20h59). O novo CSV fecha a lacuna de 24/09 21h em diante (24/09 agora tem 24 h).
- As colunas de data são as datas distintas dos registros (verificadas como ordenadas e sem repetição no script).
- Horário da manutenção = campo **“Data”** do formulário (ex.: “quarta-feira, setembro 16, 2026 03:11”), assumido como horário de Brasília. “Data de Envio” é só o envio (em 3 casos, no dia seguinte).

### Normalização e deduplicação
- Camada de normalização (`ALIASES` em `scripts/pipeline/monitoramento.py`): cada CSV é lido pelo nome das colunas, aceitando nomes alternativos (ex.: `prefixo`/`prefixo_veiculo`, `data_hora`/`timestamp`, `camera`/`id_camera`); textos com trim e espaços colapsados; `''`, `-`, `N/A`, `null`, `undefined` = vazio; status/SD/login/gravação em minúsculas; prefixo e câmera numéricos; timestamp UTC → Brasília. O novo CSV tem **o mesmo esquema** (13 colunas) dos anteriores.
- **Chave**: prefixo + câmera + data/hora completa. Entre registros com a mesma chave fica: o válido (status reconhecido) → o mais completo (mais campos preenchidos) → o do arquivo exportado mais recente → a última linha.
- Carga atual: **10.410.827** registros lidos (5.273.675 + 3.569.548 + **1.567.604** do novo CSV) → **225** repetidos removidos (224 chaves, todas duplicatas idênticas dentro do mesmo arquivo; **0 conflitos**; nenhuma sobreposição entre arquivos) → **10.410.602** registros válidos, 5.598 prefixos. Resumo em `data/processed/resumo_atualizacao.json`.

### Limpeza
- 52 prefixos aparecem com mais de uma empresa no período: exibida a empresa do registro mais recente (as demais aparecem no detalhe do veículo).
- Latitude/longitude estão vazias em todo o arquivo (não usadas).
- Formulário: 1.003 linhas, das quais **324 estão no layout antigo (colunas deslocadas uma posição, sem “Data de Envio”)** e são **cópias idênticas** de respostas já presentes → descartadas. Restam **679 formulários** de 595 prefixos (20/08 a 28/09/2026). A coluna “IP do Envio” não é publicada.
- Técnicos: nomes que diferem só por maiúsculas/minúsculas são unificados (ex.: “Abner melo” → “Abner Melo”).

### Situação atual
- Estado do **último registro** de cada câmera no período (período completo: 17.871 câmeras — 14.145 funcionais, 1.326 com erro de SD, 2.400 offline).

### Problemas em aberto (duração)
- **Dia com problema** = pelo menos um registro offline ou com erro no dia.
- A **sequência atual** termina no último dia com dados da câmera e volta enquanto os dias anteriores com dados também tiveram problema. Dias **sem nenhum registro** no meio não interrompem nem contam (coluna “dias sem dados”).
- **Desde** = horário do primeiro registro com problema no primeiro dia da sequência. Sequências que começam em 31/08 estão marcadas como “início dos dados” (a duração real pode ser maior).
- **Dias corridos** = calendário do primeiro ao último dia; **dias com problema** = dias com dado e com problema; **contínuo** = nenhum registro online durante a sequência; **intermitente** = alternou.
- Calculado no script e gravado em `data/processed/problemas_em_aberto.csv/.json` (não publicado na página).

### Manutenções: precisava? resolveu?
- **Visita** = formulários do mesmo prefixo no mesmo dia (679 formulários → 661 visitas).
- **Precisava?** Sim = algum registro offline/erro **do início (00:00) do dia anterior até o horário da visita**; Não = todos os registros online sem erro; Sem dados = nenhum registro nessa janela (visitas de agosto, anteriores ao início do monitoramento; visitas depois de 28/09 20:59; prefixos fora do monitoramento).
- **Depois** = registros após o horário da visita até a próxima visita do mesmo prefixo ou o fim dos dados.
- Calculado no script e gravado em `data/processed/manutencoes_completo.json` e `manutencoes_eventos.csv`.
- Resultado (considerando as câmeras com problema antes): **Resolvido** (todas tiveram registro online sem erro depois e não voltaram a falhar), **Resolvido com recorrência** (normalizaram, mas voltaram a falhar — mesmo que em um único registro; o tempo até voltar e o nº de registros aparecem no detalhe), **Parcialmente resolvido**, **Não resolvido**, **Sem problema antes**, **Sem dados para avaliar**.
- **Problema novo** = câmera normal antes que teve pelo menos um registro com problema depois.
- **Problemas e ações**: cada célula pode ter vários itens (separados por quebra de linha); eles são separados, padronizados e categorizados (Gravação, Configuração, Posicionamento, Câmera, Cartão SD, Cabeamento, Switch, Energia, Vandalismo/terceiros). As observações livres são lidas para: câmeras citadas, pendências (por palavras-chave, com o trecho), notação C1–C6 (mostrada como escrita), números de série/MAC. O texto original fica no detalhe.
- O painel compara as câmeras citadas no formulário com as câmeras que o monitoramento mostrava com problema.

### O que não é feito
- Nenhum dado é inventado ou estimado; sem registro = “sem dados”.
- Não há ranking de técnicos.

## Estrutura

```
scripts/atualizar_dados.py      # script único: lê data/raw e gera site/public/data + data/processed (--reusar reaproveita a carga no DuckDB)
scripts/pipeline/               # config, monitoramento (DuckDB: normalização, dedupe, intervalos, trechos), garagens, manutencao, analise
site/src/                       # main.js (rotas, cabeçalho, filtros), dados.js (carga, índices, regras), monitoramento.js, painel.js, estatisticas.js, style.css
tests/test_regras.py            # pytest: regras, dedupe/esquema alternativo, intervalos/meia-noite, garagens, texto de manutenção
tests/capturas.py               # validação no navegador (Playwright) + capturas: python tests/capturas.py URL nome
```

### Dados publicados (`site/public/data/`)
Pré-calculados no Python para a carga inicial ser leve:
- `meta.json` — última atualização, datas, empresas, garagens, câmeras, cobertura por dia, parâmetros do intervalo.
- `frota.json` (~3 MB, ~440 KB gzip) — por prefixo: empresa, garagem, câmeras; por câmera e dia, os estados presentes (máscara) e o último código; por veículo e dia, minutos online/falha/offline (base 36); dias com manutenção.
- `manut.json` — resumo de cada visita (data/hora, técnico, câmeras, garagem, precisava/resultado da análise, problema e ação em até 3 linhas).
- `cam/<câmera>.json` — minutos por dia de cada câmera (carregado só quando o filtro de câmera é usado).
- `detalhe/NN.json` — trechos da linha do tempo por câmera/dia e texto completo dos formulários, agrupados por `prefixo % 64` (carregado ao clicar).
No navegador: índices por empresa/câmera/prefixo, filtros memorizados e rolagem virtual da tabela.

## Como atualizar

```bash
python -m venv venv && . venv/bin/activate && pip install -r requirements.txt
# copie os novos arquivos para data/raw/ (bq-results-*.csv, Revisão_CFTV*.xlsx, Relatório CFTV*.xlsx)
python scripts/atualizar_dados.py          # ~3 min, usa DuckDB (limite de memória em scripts/pipeline/config.py)
python -m pytest -q tests/test_regras.py
cd site && npm ci && npm run build          # ou npm run dev para ver localmente
git add -A && git commit -m "Atualiza dados" && git push   # o GitHub Actions publica no Pages
```

Parâmetros (janela “antes” = dia anterior + dia da visita até o horário, intervalo nominal de 60 min, tolerância de 65 min) ficam em `scripts/pipeline/config.py`.
