-- Seeds 1/2: perfis, módulos, matriz de permissões, catálogos do formulário (Jotform), tecnologias, motivos de pausa, materiais e configurações.

insert into public.perfis (codigo, nome, descricao) values ('administrador', 'Administrador', 'Acesso total, inclusive usuários, permissões e auditoria'), ('operacional', 'Operacional', 'Gestão de OS, validação, estoque e indicadores'), ('manutencao', 'Manutenção', 'Técnico de campo: atende OS, preenche o formulário e solicita material');

insert into public.modulos (codigo, nome, ordem) values ('usuarios', 'Usuários', 0), ('permissoes', 'Permissões', 1), ('cadastros', 'Cadastros (empresas, garagens, veículos, catálogos)', 2), ('os', 'Ordens de Serviço', 3), ('atendimentos', 'Atendimentos e formulário', 4), ('materiais', 'Solicitações de material', 5), ('estoque', 'Estoque', 6), ('validacoes', 'Validação pós-manutenção', 7), ('indicadores', 'Indicadores', 8), ('auditoria', 'Auditoria', 9), ('configuracoes', 'Configurações', 10);

insert into public.permissoes (perfil_id, modulo, acao) values
  ((select id from public.perfis where codigo = 'administrador'), 'usuarios', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'permissoes', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'cadastros', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'os', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'atendimentos', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'materiais', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'estoque', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'validacoes', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'indicadores', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'auditoria', 'administrar'),
  ((select id from public.perfis where codigo = 'administrador'), 'configuracoes', 'administrar'),
  ((select id from public.perfis where codigo = 'operacional'), 'usuarios', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'permissoes', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'cadastros', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'cadastros', 'criar'),
  ((select id from public.perfis where codigo = 'operacional'), 'cadastros', 'editar'),
  ((select id from public.perfis where codigo = 'operacional'), 'os', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'os', 'criar'),
  ((select id from public.perfis where codigo = 'operacional'), 'os', 'editar'),
  ((select id from public.perfis where codigo = 'operacional'), 'os', 'aprovar'),
  ((select id from public.perfis where codigo = 'operacional'), 'os', 'exportar'),
  ((select id from public.perfis where codigo = 'operacional'), 'atendimentos', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'atendimentos', 'exportar'),
  ((select id from public.perfis where codigo = 'operacional'), 'materiais', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'materiais', 'aprovar'),
  ((select id from public.perfis where codigo = 'operacional'), 'estoque', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'estoque', 'editar'),
  ((select id from public.perfis where codigo = 'operacional'), 'estoque', 'exportar'),
  ((select id from public.perfis where codigo = 'operacional'), 'validacoes', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'validacoes', 'editar'),
  ((select id from public.perfis where codigo = 'operacional'), 'validacoes', 'aprovar'),
  ((select id from public.perfis where codigo = 'operacional'), 'indicadores', 'visualizar'),
  ((select id from public.perfis where codigo = 'operacional'), 'indicadores', 'exportar'),
  ((select id from public.perfis where codigo = 'operacional'), 'auditoria', 'visualizar'),
  ((select id from public.perfis where codigo = 'manutencao'), 'os', 'visualizar'),
  ((select id from public.perfis where codigo = 'manutencao'), 'atendimentos', 'criar'),
  ((select id from public.perfis where codigo = 'manutencao'), 'atendimentos', 'editar'),
  ((select id from public.perfis where codigo = 'manutencao'), 'materiais', 'criar');

insert into public.catalogo_problemas (descricao, categoria, exclusivo, ordem) values
  ('Veículo sem bateria', 'veiculo', false, 1),
  ('Fusível queimado', 'eletrica', false, 2),
  ('Switch apresentando falha', 'switch', false, 3),
  ('Câmera inoperante', 'camera', false, 4),
  ('Câmera travada', 'camera', false, 5),
  ('Sem gravação de imagens', 'gravacao', false, 6),
  ('Cabeamento rompido/danificado', 'cabeamento', false, 7),
  ('Falha na conexão dos cabos', 'cabeamento', false, 8),
  ('RJ45 crimpado incorretamente', 'cabeamento', false, 9),
  ('Conexões do switch incorretas', 'switch', false, 10),
  ('Switch não fixado corretamente', 'switch', false, 11),
  ('Câmera não fixada corretamente', 'posicionamento', false, 12),
  ('Câmera mal reposicionada', 'posicionamento', false, 13),
  ('Câmera removida por terceiros', 'terceiros', false, 14),
  ('Configuração incorreta da câmera', 'configuracao', false, 15),
  ('Câmera desligada manualmente', 'configuracao', false, 16),
  ('Câmera sem cartão de memória', 'cartao_sd', false, 17),
  ('Câmera com infiltração', 'camera', false, 18),
  ('Câmera com sinal de vandalismo', 'terceiros', false, 19),
  ('Nenhuma anomalia identificada', 'nenhum', true, 20);

insert into public.catalogo_acoes (descricao, categoria, exclusivo, material_codigo, ordem) values
  ('Normalização da gravação de imagens', 'gravacao', false, null, 1),
  ('Inserção ou substituição do cartão de memória', 'cartao_sd', false, 'CARTAO_SD', 2),
  ('Substituição da câmera defeituosa', 'camera', false, 'CAMERA', 3),
  ('Reinicialização da câmera', 'camera', false, null, 4),
  ('Reposicionamento adequado da câmera', 'posicionamento', false, null, 5),
  ('Fixação adequada da câmera', 'posicionamento', false, null, 6),
  ('Fixação adequada do switch', 'switch', false, null, 7),
  ('Correção da falha no switch', 'switch', false, null, 8),
  ('Substituição do switch', 'switch', false, 'SWITCH', 9),
  ('Correção na conexão dos cabos', 'cabeamento', false, null, 10),
  ('Reparo do cabeamento', 'cabeamento', false, null, 11),
  ('Substituição do cabeamento', 'cabeamento', false, 'CABO', 12),
  ('Crimpagem correta do conector RJ45', 'cabeamento', false, null, 13),
  ('Correção das conexões do switch', 'switch', false, null, 14),
  ('Correção e ajuste da configuração da câmera', 'configuracao', false, null, 15),
  ('Ativação da câmera', 'configuracao', false, null, 16),
  ('Instalação da câmera removida', 'camera', false, 'CAMERA', 17),
  ('Substituição do fusível', 'eletrica', false, 'FUSIVEL', 18),
  ('Câmera encaminhada para manutenção', 'camera', false, null, 19),
  ('Substituição da UCP', 'ucp', false, 'UCP', 20),
  ('Nenhuma ação realizada', 'nenhum', true, null, 21);

insert into public.tecnologias (codigo, nome, posicoes, ordem) values ('mini', 'Mini', '{21}', 1), ('midi', 'Midi', '{21,22}', 2), ('basico', 'Básico', '{21,22}', 3), ('padron', 'Padron', '{21,22,23}', 4), ('articulado', 'Articulado', '{21,22,23,24,25,26}', 5);

insert into public.motivos_pausa (descricao, aguarda_material, exige_observacao) values ('Aguardando material', true, false), ('Veículo indisponível / em operação', false, false), ('Intervalo / refeição', false, false), ('Aguardando liberação da garagem', false, false), ('Condição climática', false, false), ('Outro', false, true);

insert into public.materiais (codigo, nome, unidade) values ('CAMERA', 'Câmera', 'un'), ('CARTAO_SD', 'Cartão de memória (SD)', 'un'), ('SWITCH', 'Switch', 'un'), ('CABO', 'Cabo de rede', 'm'), ('CONECTOR_RJ45', 'Conector RJ45', 'un'), ('FUSIVEL', 'Fusível', 'un'), ('UCP', 'UCP (DVR)', 'un');

insert into public.configuracoes (chave, valor, descricao) values
  ('janela_validacao_dias', '2', 'Dias após a manutenção para validar no monitoramento (todas as câmeras da OS funcionais = Resolvido)'),
  ('janela_reincidencia_dias', '7', 'Dias após Resolvido em que nova falha na mesma câmera marca Reincidente'),
  ('sessao_expira_horas', '12', 'Tempo máximo de sessão no aplicativo (o frontend encerra a sessão após esse período)');
