# Regras do projeto — Controle de CFTV

Herdadas do projeto anterior (`analise-cftv-manutencoes`) e adaptadas ao monitoramento horário.

1. Nunca inventar dados; sem registro = “sem dados” (cinza), nunca offline.
2. Nunca alterar os arquivos originais; guardar arquivo e linha de origem (rastreabilidade).
3. Câmeras: 1001–1006 = 21–26; 21 FRONTAL, 22 FRENTE, 23 CORREDOR 1, 24 CORREDOR 2, 25 CORREDOR 3, 26 CORREDOR 4 (“Corredor” sozinho = CORREDOR 1). IDs fora disso aparecem como “sem mapeamento”.
4. Notação C1…C6 é mostrada como o técnico escreveu, sem mapear.
5. No Relatório CFTV diário, “-” = câmera não instalada (não conta).
6. Horários do BigQuery em UTC → exibir sempre em Brasília; dias parciais identificados.
7. Estado: Online (tudo ok) / Erro SD/gravação (online com item em erro) / Offline.
8. Tabela: célula verde (todas as câmeras online em todos os registros do dia), vermelho (todas offline em todos os registros), âmbar (qualquer outro caso com dados); cinza = sem dados; com uma câmera no filtro, a mesma regra para ela. Ponto azul só para manutenção. Sem texto nas células.
9. Células do formulário podem ter vários itens: separar, padronizar e manter o texto original.
10. Recorrência na mesma câmera ≠ problema novo em outra câmera.
11. Pendência detectada por palavras-chave, sempre com o trecho.
12. Técnicos unificados só quando diferem por maiúsculas/minúsculas; sem ranking de técnicos.
13. Distinguir dias corridos de dias com dado/registros.
14. Não publicar IP de envio nem dados brutos; documentar premissas no README.
15. Interface em português do Brasil; duas páginas (Monitoramento e Estatísticas) sem recarregar; sem barra lateral, ícone de câmera ou emoji; fonte Inter; paleta e tamanhos definidos em `site/src/style.css`; definições ficam no README.
16. Datas da tabela sempre vindas dos dados (exceção de layout: na Matriz por mês, os dias do mês sem arquivo aparecem como colunas vazias e neutras, sem status, só para manter o tamanho do mês — decisão de 07/10/2026); novos CSVs passam pela normalização e pela deduplicação por prefixo + câmera + data/hora.
17. Linha do tempo respeita a resolução da coleta (~1 h): registro vale até o próximo (≤ 65 min) ou 60 min; lacunas = Sem dados; disponibilidade = online ÷ tempo monitorado (sem “Sem dados”).
18. Garagem: valor válido mais recente entre todas as fontes, conflitos registrados; sem fonte = “Não informado”; nunca deduzir da empresa.
