# Controle de CFTV

Painel estático (Vite + JavaScript, sem framework) publicado no GitHub Pages: https://leticia-noxxon.github.io/controle-cftv/

Duas páginas, sem recarregar (rota por `#`):

- **Monitoramento** (`/`): cabeçalho (última atualização = horário do registro mais recente dos dados), filtros, 4 cards, tabela Garagem × Prefixo × Disponibilidade × datas, painel de detalhe, legenda e paginação. Botão `›` no canto → Estatísticas.
- **Estatísticas** (`#estatisticas`): ranking de garagens, distribuição dos status (rosca) e evolução da disponibilidade (linha). Botão `‹` volta ao monitoramento.

## Página 1 — Monitoramento

- **Filtros** (combinam entre si; aplicados em “Filtrar” ou Enter): Empresa, Garagem (valores reais das fontes + “Não informado”), Câmera, Prefixo (parte do número ou lista separada por vírgula) e Período (data inicial–final, limitado às datas presentes nos dados).
- **Cards** (estado do **último registro de cada câmera dentro do período filtrado**; % sobre as câmeras filtradas):
  - *Funcionais* = último registro online com SD/login/gravação ok.
  - *Erro de SD card* = último registro online com SD em erro (nos dados, sempre SD + gravação).
  - *100% offline* = último registro offline.
  - *Veículos com falha* = prefixos com pelo menos uma câmera filtrada com erro de SD ou offline no último registro.
- **Tabela**: Garagem (190 px), Prefixo (85 px), Disponibilidade (105 px) e uma coluna por data. As datas vêm dos próprios dados (datas distintas dos registros, em Brasília), nunca de uma lista fixa. As colunas de data dividem toda a largura restante (mínimo 28 px); se não couberem, só a área das datas rola na horizontal, com as 3 primeiras colunas e o cabeçalho fixos. A altura da tabela acompanha a janela. Clique em Garagem/Prefixo/Disponibilidade para ordenar. Só a página atual é desenhada.
- **Cor da célula** (sem texto):

  | Situação | Cor |
  |---|---|
  | Todas as câmeras (filtradas) com registro no dia ficaram sempre online e sem erro | Verde `#22C55E` |
  | Uma ou mais câmeras tiveram algum registro offline ou com erro de SD, mas não todas | Âmbar `#F59E0B` |
  | Todas as câmeras com registro no dia tiveram algum registro offline/erro | Vermelho `#EF4444` |
  | Nenhum registro no dia | Cinza `#CBD5E1` (nunca conta como offline) |

  Com **uma câmera** no filtro, a célula mostra o estado dessa câmera: vermelho se teve algum registro offline no dia, âmbar se teve erro de SD (sem offline), verde se só online, cinza sem dados.
- **Ponto azul** (6 px, canto superior direito) = há formulário de manutenção do veículo naquele dia (“Manutenção registrada”). Tooltip da célula: data, câmeras, disponibilidade do dia, tempo online, tempo offline e Manutenção Sim/Não.
- **Disponibilidade** (coluna e tooltip) = tempo online ÷ tempo monitorado no período, com as câmeras filtradas. **Tempo monitorado exclui “Sem dados”**; erro de SD conta como não disponível.
- **Paginação**: “Mostrando 1–20 de N”, páginas com reticências, 20/50/100 por página (padrão 20). Todos os prefixos são alcançáveis.
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
Filtros Empresa, Garagem, Câmera e Período (afetam tudo).
- **Ranking de garagens com maiores problemas** (ordenado pela menor disponibilidade): disponibilidade = tempo online ÷ tempo monitorado (mesma regra da página 1), câmeras com falha e veículos com falha (mesma definição dos cards, último registro no período). “Não informado” aparece no fim, sem posição.
- **Distribuição dos status**: horas-câmera Online, Offline, Erro SD/Falha e Sem dados. Sem dados = (câmeras × horas cobertas pela extração em cada dia) − horas monitoradas.
- **Evolução da disponibilidade**: disponibilidade diária (0–100 %), com seletor de garagem (padrão: todas).
Gráficos em SVG próprio (sem biblioteca).

## Garagem
- Fontes verificadas: os 3 CSVs de monitoramento (**não têm coluna de garagem**), o `Relatório CFTV - 28.09.2026.xlsx` (**não tem coluna de garagem**) e o formulário de manutenção (coluna Garagem). A aba auxiliar “Planilha1” de um formulário antigo só lista nomes de garagem, sem prefixo.
- `scripts/pipeline/garagens.py` reúne todas as fontes que tiverem uma coluna com “garag” no nome: trim, espaços colapsados, Unicode NFC; `''`, `-`, `N/A`, `null`, `undefined` etc. = vazio. Por prefixo, vence o valor válido **mais recente** (empate: formulário > relatório > monitoramento); conflitos são contados no log e gravados em `data/processed/garagens_conflitos.json`.
- Resultado: 595 prefixos com garagem no formulário, **0 conflitos**; **581 dos 5.598 prefixos monitorados** têm garagem (os outros 14 prefixos do formulário não aparecem no monitoramento). Os demais mostram **“Não informado”** — nenhuma fonte informa a garagem deles. A garagem nunca é deduzida da empresa. O “—” anterior era falta de dado na fonte, não erro de junção.

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
- **Precisava?** Sim = algum registro offline/erro nas **24 h anteriores** ao horário da visita; Não = todos os registros online sem erro; Sem dados = nenhum registro nessa janela (visitas de agosto, anteriores ao início do monitoramento; visitas depois de 28/09 20:59; prefixos fora do monitoramento).
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
- `manut.json` — resumo de cada visita (data/hora, técnico, câmeras, problema e ação em até 3 linhas).
- `cam/<câmera>.json` — minutos por dia de cada câmera (carregado só quando o filtro de câmera é usado).
- `detalhe/NN.json` — trechos da linha do tempo por câmera/dia e texto completo dos formulários, agrupados por `prefixo % 64` (carregado ao clicar).
No navegador: índices por empresa/garagem/câmera/prefixo, filtros memorizados e só a página atual da tabela é desenhada.

## Como atualizar

```bash
python -m venv venv && . venv/bin/activate && pip install -r requirements.txt
# copie os novos arquivos para data/raw/ (bq-results-*.csv, Revisão_CFTV*.xlsx, Relatório CFTV*.xlsx)
python scripts/atualizar_dados.py          # ~3 min, usa DuckDB (limite de memória em scripts/pipeline/config.py)
python -m pytest -q tests/test_regras.py
cd site && npm ci && npm run build          # ou npm run dev para ver localmente
git add -A && git commit -m "Atualiza dados" && git push   # o GitHub Actions publica no Pages
```

Parâmetros (janela “antes” de 24 h, intervalo nominal de 60 min, tolerância de 65 min) ficam em `scripts/pipeline/config.py`.
