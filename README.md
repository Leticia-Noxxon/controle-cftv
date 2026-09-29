# Controle de CFTV

Painel estático (GitHub Pages) com a situação das câmeras de CFTV da frota:

1. **Situação atual**: câmeras online, com erro de cartão SD e offline — no total, por câmera (21 a 26) e por prefixo.
2. **Matriz diária** (data × prefixo): cor pelos estados do dia (todas OK / alguma câmera com problema / todas offline), com as câmeras e o problema no detalhe.
3. **Problemas em aberto**: desde quando cada câmera está com problema (dias consecutivos) e há quantos dias, para a reunião de cronograma de correção.
4. **Manutenções**: veículos atendidos, se precisavam (CFTV antes da visita), se resolveu (CFTV depois), problemas relatados e ações realizadas.

Também tem análises por câmera, empresa, garagem e técnico (sem ranking), uma área de qualidade dos dados, filtros (prefixo, empresa, garagem, câmera, período, status), tabelas ordenáveis, exportação para Excel, impressão/PDF e tema escuro opcional.

## Fontes de dados

| Arquivo | O que é | Uso |
|---|---|---|
| `bq-results-20260928-132402-….csv` e `bq-results-20260928-132836-….csv` | Monitoramento horário exportado do BigQuery (um registro por câmera ≈ a cada hora) | Situação atual, matriz, duração dos problemas, antes/depois das manutenções |
| `Revisão_CFTV2026-09-11_13_40_20.xlsx` | **Formulário de manutenção** (uma linha por visita) | Manutenções |
| `Relatório CFTV - 28.09.2026.xlsx` | **Relatório CFTV diário de 28/09/2026** (retrato consolidado do dia, por prefixo) | Fonte complementar da situação atual e coluna “Relatório 28/09” |

> Observação: no pedido original, o `Revisão_CFTV…` foi descrito como dados das câmeras e o `Relatório CFTV…` como formulário de manutenção. Pelo conteúdo, os papéis são o inverso; o painel usa cada arquivo pelo que ele contém.

Os arquivos brutos **não são versionados** (ficam em `data/raw/`, ignorado pelo git). As somas SHA-256 dos arquivos usados estão em `data/CHECKSUMS_SHA256_raw.txt`.

## Premissas e regras (documentadas também na aba “Como ler”)

### Câmeras
`id_camera` 1001 = câmera 21 (Frontal), 1002 = 22 (Frente), 1003 = 23 (Corredor 1), 1004 = 24 (Corredor 2), 1005 = 25 (Corredor 3), 1006 = 26 (Corredor 4). O `id_camera` 1007 aparece em um único prefixo (6001, NOXXONSAT; 3.885 registros) e é exibido como “id 1007 (sem mapeamento)”.

### Estado de cada registro do monitoramento
| status | sdcard | login | recording | Estado no painel |
|---|---|---|---|---|
| online | ok | ok | ok | **Online** |
| online | error (qualquer item) | … | … | **Erro SD/gravação** (falha técnica). Nos dados: SD + gravação em erro (597.393 registros); só gravação em erro (1 registro); login nunca em erro |
| offline | (vazio) | (vazio) | (vazio) | **Offline** |
| sem registro | | | | **Sem dados** — nunca conta como offline |

“Erro de cartão SD” nos indicadores = câmera online com SD (e gravação) em erro.

### Datas e horários
- O `timestamp` do BigQuery está em **UTC**; tudo foi convertido para **horário de Brasília (UTC−3)** e a data de cada registro é a data em Brasília.
- Período disponível: **31/08/2026 21:00 a 24/09/2026 20:59** (Brasília). Dias parciais: 31/08 (só 21h–23h59), 14/09 (até 20h59), **15/09 (só 21h–23h59 — o dia 15/09 UTC não está na exportação)** e 24/09 (até 20h59). De 25/09 em diante não há monitoramento.
- A matriz mostra setembro; os registros de 31/08 entram só nas durações e no “antes” das manutenções.
- Horário da manutenção = campo **“Data”** do formulário (ex.: “quarta-feira, setembro 16, 2026 03:11”), assumido como horário de Brasília. “Data de Envio” é só o envio (em 3 casos, no dia seguinte).

### Limpeza
- 8.843.223 registros lidos; **115 duplicados idênticos** removidos → 8.843.108.
- 52 prefixos aparecem com mais de uma empresa no período: exibida a empresa do registro mais recente (as demais aparecem no detalhe do veículo).
- Latitude/longitude estão vazias em todo o arquivo (não usadas).
- Formulário: 1.003 linhas, das quais **324 estão no layout antigo (colunas deslocadas uma posição, sem “Data de Envio”)** e são **cópias idênticas** de respostas já presentes → descartadas. Restam **679 formulários** de 595 prefixos (20/08 a 28/09/2026). A coluna “IP do Envio” não é publicada.
- Técnicos: nomes que diferem só por maiúsculas/minúsculas são unificados (ex.: “Abner melo” → “Abner Melo”).

### Matriz diária
- Número = **disponibilidade do dia** = registros online sem erro ÷ todos os registros das câmeras do veículo no dia.
- Cor = **quais estados ocorreram** no dia (presença, não proporção): verde = só online; degradês = combinações (verde→laranja, verde→vermelho, laranja→vermelho, verde→laranja→vermelho); **vermelho sólido = todos os registros do dia offline**; laranja sólido = só erro; cinza = sem dados. Faixa azul no topo = manutenção no dia (azul só para manutenção).
- Modo “Câmeras com problema” mostra no lugar do número quais câmeras tiveram problema; o tooltip traz câmera, tipo de problema, período offline/erro e manutenção; o clique abre a linha do tempo horária por câmera com os horários originais.
- Com o filtro de câmera, a cor representa só aquela câmera.

### Situação atual
- Monitoramento: estado do **último registro** de cada câmera (17.720 câmeras). Câmeras sem registro no último dia (24/09) entram com o último estado conhecido e a data aparece; podem ser excluídas por uma opção.
- Relatório 28/09: estado de cada câmera no relatório; “-” = câmera não instalada (não conta). Só prefixos que também existem no monitoramento.
- Veículo “todas offline” = todas as câmeras offline; “alguma câmera com problema” = pelo menos uma com erro/offline, mas não todas offline.

### Problemas em aberto (duração)
- **Dia com problema** = pelo menos um registro offline ou com erro no dia.
- A **sequência atual** termina no último dia com dados da câmera e volta enquanto os dias anteriores com dados também tiveram problema. Dias **sem nenhum registro** no meio não interrompem nem contam (coluna “dias sem dados”).
- **Desde** = horário do primeiro registro com problema no primeiro dia da sequência. Sequências que começam em 31/08 estão marcadas como “início dos dados” (a duração real pode ser maior).
- **Dias corridos** = calendário do primeiro ao último dia; **dias com problema** = dias com dado e com problema; **contínuo** = nenhum registro online durante a sequência; **intermitente** = alternou.
- Por padrão aparecem só câmeras com registro em 24/09 (opção para incluir as demais). A coluna “Relatório 28/09” mostra o estado da câmera no relatório diário, útil para ver o que mudou depois de 24/09.

### Manutenções: precisava? resolveu?
- **Visita** = formulários do mesmo prefixo no mesmo dia (679 formulários → 661 visitas).
- **Precisava?** Sim = algum registro offline/erro nas **24 h anteriores** ao horário da visita; Não = todos os registros online sem erro; Sem dados = nenhum registro nessa janela (visitas de agosto, anteriores ao início do monitoramento; visitas depois de 24/09; prefixos fora do monitoramento).
- **Depois** = registros após o horário da visita até a próxima visita do mesmo prefixo ou o fim dos dados.
- Resultado (considerando as câmeras com problema antes): **Resolvido** (todas tiveram registro online sem erro depois e não voltaram a falhar), **Resolvido com recorrência** (normalizaram, mas voltaram a falhar — mesmo que em um único registro; o tempo até voltar e o nº de registros aparecem no detalhe), **Parcialmente resolvido**, **Não resolvido**, **Sem problema antes**, **Sem dados para avaliar**.
- **Problema novo** = câmera normal antes que teve pelo menos um registro com problema depois.
- **Problemas e ações**: cada célula pode ter vários itens (separados por quebra de linha); eles são separados, padronizados e categorizados (Gravação, Configuração, Posicionamento, Câmera, Cartão SD, Cabeamento, Switch, Energia, Vandalismo/terceiros). As observações livres são lidas para: câmeras citadas, pendências (por palavras-chave, com o trecho), notação C1–C6 (mostrada como escrita), números de série/MAC. O texto original fica no detalhe.
- O painel compara as câmeras citadas no formulário com as câmeras que o monitoramento mostrava com problema.

### O que não é feito
- Nenhum dado é inventado ou estimado; sem registro = “sem dados”.
- Não há ranking de técnicos.

## Estrutura

```
scripts/atualizar_dados.py      # script único: lê data/raw e gera site/public/data + data/processed
scripts/pipeline/               # config, monitoramento (DuckDB), manutencao, relatorio, analise
site/                           # Vite + JavaScript (sem framework); SheetJS para Excel
site/public/data/               # dados publicados (meta, frota, problemas, manutencoes, detalhe/NN.json)
tests/                          # pytest (regras) e captura de telas com Playwright
```

Dados publicados: `meta.json` (cobertura por dia, verificações), `frota.json` (por prefixo: estado diário, câmeras, último estado, relatório 28/09), `problemas.json`, `manutencoes.json` (visitas + formulários sem o IP) e `detalhe/NN.json` (trechos de estado por câmera/dia com horários originais, agrupados por `prefixo % 64`).

## Como atualizar

```bash
python -m venv venv && . venv/bin/activate && pip install -r requirements.txt
# copie os novos arquivos para data/raw/ (bq-results-*.csv, Revisão_CFTV*.xlsx, Relatório CFTV*.xlsx)
python scripts/atualizar_dados.py          # ~2 min, usa DuckDB (limite de memória em scripts/pipeline/config.py)
python -m pytest -q tests/test_regras.py
cd site && npm ci && npm run build          # ou npm run dev para ver localmente
git add -A && git commit -m "Atualiza dados" && git push   # o GitHub Actions publica no Pages
```

O mês da matriz e a janela “antes” (24 h) ficam em `scripts/pipeline/config.py`.
