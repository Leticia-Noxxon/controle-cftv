# Análise do formulário Jotform "Revisão CFTV" (250754083828665)

Fonte: HTML público de https://form.jotform.com/250754083828665 (baixado em 01/10/2026), com as regras lidas de `JotForm.setConditions`. Os resultados foram conferidos com a aba `revisao_cftv` de `data/raw/garagens/jotform_responses.xlsx`, que tem 2.869 respostas.

## Estrutura (4 abas: Dados · Inspeção · Câmera · Material)

O formulário usa o widget "formulário com abas" (`id_173`), com títulos `Dados\nInspeção\nCâmera\nMaterial`. Ele tem 3 quebras de página, ou seja, 4 páginas.

### Página 1: Dados
| ID | Campo | Tipo | Obrigatório | Regras / opções |
|---|---|---|---|---|
| 156 | Nome | texto ("Primeiro e segundo nome") | sim | No sistema novo vem do usuário logado e não é digitado. |
| 17 | Data | data + hora | sim | Padrão é a data e hora atuais; não aceita data passada (`disallowPast`, `limitDate`). Formato gravado: `{"day","month","year","timeInput","hour","min","datetime"}`. No sistema novo vem do **horário do servidor**. |
| 22 | Garagem | lista | sim | 20 opções: A2 Transportes, Alfa Rodobus, Alfa Rodobus SPE, Gato Preto - Portinari, Gato Preto - Mackenzie, Norte Buss A1, Norte Buss A2, Santa Brigida, Trans União D3, Trans União D7, Via Sudeste Cursino, Via Sudeste Sapopemba, Viação Grajaú, Viação Metrópole AE Carvalho, Viação Metrópole Brás, Viação Metrópole Iguatemi, Viação Metrópole Imperador, Viação Metrópole Itaim, Viação Metrópole M'Boi Mirim, Viação Metrópole Pinedo. No sistema novo o padrão é a **Garagem atual** do técnico. |
| 132 | Prefixo | número | sim | "Insira o prefixo do veículo". No sistema novo vem da OS, com o veículo já cadastrado. |
| 147 | ID | número | sim | "Insira o ID do equipamento" (UCP/DVR). |
| 96 | Tecnologia | escolha única | sim | Mini, Midi, Básico, Padron, Articulado. **Define quais câmeras aparecem** (ver regras). |
| 186 | Imagem da Frente do Ônibus | upload múltiplo | **sim** | |

### Página 2: Inspeção
| ID | Campo | Tipo | Obrigatório |
|---|---|---|---|
| 155 | Condição Pré-Serviço | upload múltiplo | não |
| 154 | Condição Pós-Serviço | upload múltiplo | não |

### Página 3: Câmera (seções recolhíveis 21 a 26)
Para cada câmera N ∈ {21, …, 26} há uma seção recolhível com título, **Problemas Detectados** (caixas de seleção, várias escolhas), **Ações** (caixas de seleção) e **Imagem da Câmera N** (upload múltiplo). Nenhum desses campos é obrigatório.

| Câmera | Problemas | Ações | Imagem |
|---|---|---|---|
| 21 | q69 | q71 | q76 |
| 22 | q135 | q136 | q137 |
| 23 | q138 | q139 | q92 |
| 24 | q140 | q141 | q78 |
| 25 | q142 | q145 | q93 |
| 26 | q144 | q146 | q94 |

**Problemas Detectados** (20 opções, iguais para todas as câmeras): Veículo sem bateria; Fusível queimado; Switch apresentando falha; Câmera inoperante; Câmera travada; Sem gravação de imagens; Cabeamento rompido/danificado; Falha na conexão dos cabos; RJ45 crimpado incorretamente; Conexões do switch incorretas; Switch não fixado corretamente; Câmera não fixada corretamente; Câmera mal reposicionada; Câmera removida por terceiros; Configuração incorreta da câmera; Câmera desligada manualmente; Câmera sem cartão de memória; Câmera com infiltração; Câmera com sinal de vandalismo; **Nenhuma anomalia identificada**.

**Ações** (21 opções): Normalização da gravação de imagens; Inserção ou substituição do cartão de memória; Substituição da câmera defeituosa; Reinicialização da câmera; Reposicionamento adequado da câmera; Fixação adequada da câmera; Fixação adequada do switch; Correção da falha no switch; Substituição do switch; Correção na conexão dos cabos; Reparo do cabeamento; Substituição do cabeamento; Crimpagem correta do conector RJ45; Correção das conexões do switch; Correção e ajuste da configuração da câmera; Ativação da câmera; Instalação da câmera removida; Substituição do fusível; Câmera encaminhada para manutenção; Substituição da UCP; **Nenhuma ação realizada**.

### Página 4: Material / Observação
| ID | Campo | Tipo | Regras |
|---|---|---|---|
| 149 | Câmera Utilizada | número com setas | mínimo 0; "quantidade de câmeras utilizadas na manutenção do veículo" |
| 153 | Cartão de Memória Utilizado | número com setas | mínimo 0 |
| 152 | Switch Utilizado | número com setas | mínimo 0 |
| 150 | Imagem do Switch – Antes da substituição | upload múltiplo | opcional |
| 151 | Imagem do Switch – Após a substituição | upload múltiplo | opcional |
| 116 | Observações | texto longo | opcional |

## Uploads
- Todos os 11 campos de upload aceitam vários arquivos.
- Tipos aceitos: `pdf, doc, docx, xls, xlsx, csv, txt, rtf, html, zip, mp3, wma, mpg, flv, avi, jpg, jpeg, png, gif`, com limite de **10.854 KB** (~10,6 MB) por arquivo.
- **No sistema novo:** só imagens (`image/jpeg`, `image/png`, `image/webp`; HEIC convertido no aparelho), compressão no navegador (lado maior 1600 px, ~80 %), validação de tipo e tamanho também no Storage (políticas do bucket) e caminho `os/<os_id>/<atendimento_id>/<campo>/<uuid>.jpg`. A captura é pela câmera (`capture="environment"`) ou pela galeria.

## Lógica condicional (câmeras visíveis por Tecnologia)
São 8 regras do tipo `HideMultiple`, que escondem cabeçalho, problemas, ações e imagem das câmeras. As seções recolhíveis em si continuam visíveis. Resultado efetivo:

| Tecnologia | Câmeras visíveis | Conferência nas respostas (seções com problema preenchido) |
|---|---|---|
| Mini | 21 | Mini: só a 21 (391) ✔ |
| Básico | 21, 22 | 21 (60) e 22 (18) ✔ |
| Padron | 21, 22, 23 | 21 (417), 22 (480), 23 (408) ✔ |
| Midi | 21–26 (sem regra); Trans União D3/D7: 21–22 | Na prática quase sempre 21 e 22 (48/34); 23–26 aparecem 1 a 2 vezes |
| Articulado | 21–26 | as 6 ✔ |

Observação: as regras 2 e 3 (Trans União D3/D7 + Mini → 21 e 22) são anuladas pelas regras 4 e 5 ("Mini" e "garagem ≠ D7" / "≠ D3"), que escondem a câmera 22 em qualquer garagem. Por isso Mini sempre mostra só a 21. **No sistema novo**, as câmeras de cada veículo vêm da tabela `cameras` (cadastro por veículo/tecnologia). A tabela `tecnologias_cameras` replica o padrão acima e permite exceções por garagem.

## Dados gravados (cruzamento com o Excel)
- A aba `revisao_cftv` tem 2.869 respostas.
- **Tecnologia:** Articulado 915, Padron 880, Mini 475, Básico 347, Midi 252.
- **Garagens:** as 20 da lista aparecem, algumas com texto corrompido (`ViaþÒo Metr¾pole …`, por gravação em codificação cp850). O importador deve normalizar pela tabela `MAPA_FORMULARIO`, que já existe em `site/v2/src/dados.js`.
- **Problemas mais frequentes:** Nenhuma anomalia (1.790), Sem gravação (1.403), Configuração incorreta (1.099), Mal reposicionada (535), Inoperante (565), Travada (355).
- **Ações mais frequentes:** Nenhuma ação (2.018), Normalização da gravação (1.469), Correção/ajuste de configuração (1.268), Reinicialização (618), Reposicionamento (554).
- **Material:** "Cartão de memória utilizado" foi preenchido em 495 respostas (318 com 1). "Câmera utilizada" em 210, "Switch utilizado" em 231.
- **Observações:** preenchidas em 2.635 respostas (92 %). É o campo mais usado e costuma repetir o prefixo e listar o que foi feito.
- **Imagem da frente:** vazia em só 1 resposta, o que confirma o campo obrigatório.

## Regras do formulário nativo (sistema novo)
1. Nome, data e hora vêm do usuário e do servidor. Garagem, prefixo, ID do equipamento e tecnologia já vêm preenchidos a partir da OS e do cadastro, mas podem ser corrigidos com registro em auditoria.
2. **Obrigatórios:** foto da frente do ônibus; para cada câmera visível, ao menos 1 problema e 1 ação.
   - "Nenhuma anomalia identificada" e "Nenhuma ação realizada" são exclusivos: marcar um desmarca os outros.
   - Câmera com problema diferente de "Nenhuma anomalia" exige foto da câmera.
   - Se houver "Substituição do switch", são obrigatórias as fotos do switch antes e depois.
3. **Materiais:** câmera, cartão de memória e switch (≥ 0). Quantidade maior que 0 gera **movimentação de saída de estoque** vinculada ao atendimento.
4. **Rascunho automático:** salvo a cada alteração (com espera de 1,5 s) em IndexedDB e sincronizado em `respostas_manutencao.rascunho`.
5. **Fila offline:** fotos e envio ficam na fila e sincronizam ao voltar a conexão.
