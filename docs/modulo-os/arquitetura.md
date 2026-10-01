# Módulo de OS / manutenção CFTV — arquitetura

Estado em 01/10/2026. Complementa `jotform_analise.md` (formulário atual e regras do formulário nativo).

## 1. O que já existe (mapeado antes de mexer)

**Frontend estático** (Vite + JavaScript puro, sem framework), publicado no GitHub Pages pelo workflow `.github/workflows`:

| Pasta | Publicado em | Papel |
|---|---|---|
| `site/oficial/` | raiz | site oficial, **congelado** (cópia do redesign aprovado; tag `pre-modulo-os`) |
| `site/v2/` | `/v2/` | **ambiente de teste**; só aqui entra o módulo de OS |
| `site/v1/` | `/v1/` | backup da versão anterior |

Módulos de `site/v2/src` (mesma estrutura em `site/oficial/src`):
- `main.js`: barra lateral, cabeçalho, roteamento por hash (`#matriz`, `#usuarios`), tema claro/escuro (`localStorage cftv-tema`).
- `dados.js`: carga dos JSON publicados (`meta`, `frota`, `manut`, `cam/*`, `detalhe/*`), índices, `ICONE`, utilitários (`esc`, `dmy`); `os.js` lê `os.json` e exporta a OS em Excel (`xlsx.js` + ExcelJS sob demanda).
- `visao.js` (Visão geral), `matriz.js` (Matriz diária), `garagem.js` (modal de garagem), `painel.js` (painel do veículo), `calendario.js`, `grafico.js`, `texto.js`, `logo.js`.
- `style.css`: tokens visuais em variáveis CSS (`--bg`, `--surface`, `--border`, `--text*`, `--brand*`, cores de status `--c-on/fa/off/sd/nd`, `--r-s/m/l`, `--s1..s6`), tema escuro em `html[data-tema="escuro"]`, layouts responsivos (≥1600 barra lateral larga, 641–1599 compacta, ≤640 barra inferior).

**Pipeline de dados** (Python + DuckDB): `scripts/atualizar_dados.py` usa `scripts/pipeline/*` (config, monitoramento, garagens, manutencao, analise, relatorio) e grava `site/public/data/*.json` e `site/public/os.json` (`scripts/gerar_v2_os.py`). Os dados continuam estáticos e públicos como hoje; o módulo de OS **não** substitui esse fluxo.

## 2. Arquitetura escolhida: GitHub Pages + Supabase

- **Frontend**: continua no GitHub Pages (custo zero). O módulo de OS entra só em `/v2/`, atrás de feature flag (`OS_ATIVO` em `site/v2/src/supabase.js`: URL + chave publicável definidas e `VITE_AMBIENTE === 'teste'`). O SDK `@supabase/supabase-js` é carregado sob demanda (import dinâmico), então os painéis não ficam mais pesados.
- **Backend**: Supabase (projeto `controle-cftv`, `baowdgzjmaxtkuugprmm`, região sa-east-1, plano gratuito): Postgres + Auth + Storage.
  - Regras de negócio e segurança **no banco**: RLS em todas as tabelas (`force row level security`), RPCs `security definer` com `search_path = ''`, gatilhos de proteção e auditoria. O frontend nunca decide sozinho.
  - O navegador usa só a **chave publicável** (`sb_publishable_…`). A chave de serviço nunca vai para o frontend nem para o repositório.
  - `anon` não tem acesso a nenhuma tabela nem RPC (conferido: `permission denied`). Tudo exige usuário logado **e ativo**.
- **Login**: link mágico por e-mail (sem senha). Novo usuário do Auth → gatilho `privado.ao_criar_usuario_auth` cria a linha em `public.usuarios`: com pré-autorização (`convites`) entra ativo com o perfil definido; sem ela fica **inativo** até um administrador liberar.
- **Primeiro administrador**: código de uso único (só o hash bcrypt fica em `privado.bootstrap_admin`, válido por 7 dias, 10 erros invalidam, 5 tentativas por usuário a cada 15 min). A pessoa entra por link mágico e digita o código; `reivindicar_admin` só funciona enquanto não houver administrador ativo. Ninguém escolhe senha por ela.
- **Sessão**: o frontend encerra a sessão 12 h após o login (`configuracoes.sessao_expira_horas`).

## 3. Banco (migrations em `supabase/migrations/`)

| Arquivo | Conteúdo |
|---|---|
| `0100_base` | extensões (pgcrypto, citext em `extensions`), schema `privado` (não exposto na API), enums, configurações, catálogos (problemas, ações, motivos de pausa, tecnologias) |
| `0200_usuarios_permissoes` | empresas, garagens, perfis, módulos, permissões (perfil × módulo × ação), usuários, exceções por usuário, convites, primeiro admin, limite de tentativas, funções de autorização, RPCs `meu_usuario`, `minhas_permissoes`, `reivindicar_admin`, `definir_garagem_atual`, `registrar_acesso` |
| `0300_frota` | veículos, equipamentos, câmeras, `monitoramento_diario` |
| `0400_os_atendimentos` | OS (número `OS-000001`, prioridade, uma OS aberta por veículo), atendimentos (um ativo por OS e por técnico), pausas, formulário nativo com rascunho versionado, problemas, ações, imagens, histórico de status; RPCs iniciar/pausar/retomar/finalizar/cancelar/salvar_rascunho; tempos pelo relógio do servidor |
| `0500_estoque` | materiais, estoque por local, movimentações imutáveis, solicitações de material |
| `0600_validacao_auditoria_indicadores` | validação pós-manutenção (resolvido/não resolvido/reincidente), auditoria imutável, envio do formulário com as regras do Jotform, OS automática do monitoramento, indicadores, "Meu desempenho", linha do tempo do veículo, fila offline idempotente |
| `0700_rls` | RLS e privilégios mínimos |
| `0800_storage` | bucket privado `manutencao` (jpeg/png/webp, 10 MB) e políticas por pasta `os/<os>/<atendimento>/…` |
| `0900_seed_catalogos`, `1000_seed_frota` | perfis, matriz de permissões, catálogos; 20 empresas, 20 garagens, 5.598 veículos, 17.870 câmeras (gerado por `scripts/gerar_seed_supabase.py`) |
| `1100_ajustes_advisors` | índices nas chaves estrangeiras e uma política permissiva por ação (Advisors do Supabase) |

**Concorrência ao iniciar manutenção**: `iniciar_atendimento` trava a linha da OS (`select … for update`) e confere o status; índices únicos parciais garantem no banco um atendimento ativo por OS e por técnico. Teste local com 20 disputas simultâneas: sempre exatamente um técnico inicia; o outro recebe "Esta OS já está em atendimento por <nome>."

**Advisors (segurança)**: nenhum erro. Restam avisos "SECURITY DEFINER executável por authenticated" nas RPCs públicas: são intencionais (são a API do sistema; cada uma confere `privado.tem_permissao()` e `anon` não executa). Performance: só "índice ainda não usado" (banco recém-criado).

## 4. Testes

- `supabase/tests/rodar_local.sh` cria um Postgres local com um stub mínimo do Supabase (`00_stub_supabase_local.sql`: papéis, `auth.users`, `auth.uid()`) e aplica todas as migrations.
- `supabase/tests/test_banco.py` (psycopg): convites, usuário sem convite inativo, anon sem acesso, primeiro admin, matriz e exceções, sem autopromoção, OS automática/manual, proteção de status, **concorrência**, pausa/retomada, autosave versionado, regras do formulário, fotos, estoque, validação/reincidência, indicadores, auditoria imutável.
- `tests/usuarios_v2.py`: tela de login, primeiro acesso e "Usuários e Permissões" em 3 telas × claro/escuro, com as chamadas ao Supabase simuladas (não envia e-mail nem grava no projeto).

## 5. Fases

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Login (link mágico), primeiro administrador, Usuários e Permissões (usuários, pré-autorizações, matriz por perfil, exceções por usuário) | **no ar em /v2/** |
| 2 | Cadastros (empresas, garagens, veículos, equipamentos, catálogos) e garagem atual do técnico | banco pronto; telas a fazer |
| 3 | Fila de OS (automática pelo monitoramento + manual), prioridade, detalhe da OS | banco pronto; carga diária do `monitoramento_diario` a ligar no pipeline (chave de serviço só no GitHub Actions) |
| 4 | Atendimento: iniciar (trava), pausar/retomar, cronômetro do servidor, formulário nativo com autosave e fotos | banco pronto; telas a fazer |
| 5 | Materiais e estoque (solicitação, aprovação, atendimento, movimentações) | banco pronto; telas a fazer |
| 6 | Validação pós-manutenção automática e reincidência | banco pronto; agendamento a ligar |
| 7 | Indicadores, "Meu desempenho", linha do tempo do veículo, auditoria | banco pronto; telas a fazer |
| 8 | Offline (fila local idempotente), PWA, e-mail próprio (SMTP) para convites em escala, levar para a raiz | a fazer |

## 6. Configuração que só pode ser feita no painel do Supabase

- **Authentication → URL Configuration**: Site URL = `https://leticia-noxxon.github.io/controle-cftv/v2/`; Redirect URLs = a mesma URL e `http://localhost:4174/v2/` (testes locais). Sem isso o link mágico volta para `localhost:3000`.
- **E-mail**: o serviço de e-mail padrão do Supabase só entrega para e-mails da equipe da organização e tem limite baixo por hora. Para técnicos externos, configurar SMTP próprio (Authentication → Emails → SMTP Settings).

### pg_safeupdate (Supabase)
A API do Supabase carrega `pg_safeupdate`: todo `DELETE`/`UPDATE` executado por `authenticated`/`anon` (inclusive dentro de RPCs e gatilhos) precisa de `WHERE`. A migração `20261001001200_corrige_safeupdate.sql` corrigiu `reivindicar_admin`. O teste local (`supabase/tests/test_banco.py`) carrega `safeupdate` em toda requisição como usuário (desligue com `SAFEUPDATE=0`); para instalar localmente: `git clone https://github.com/eradman/pg-safeupdate && make && sudo make install`.
