# GreenIA — governança e acompanhamento

## Escopo implementado

Evolução incremental sobre `greenia-lite` (base `2379876d7a8bee6d4631f57e3e715c9aefdc6d8e`), conservando o sistema visual existente e sem acrescentar dependências ou migrar frameworks.

| Recurso | Comportamento entregue |
| --- | --- |
| Preparação do ambiente | Checklist baseado nas configurações reais, por permissão. Não equivale a certificação ou conclusão do onboarding. Integrações são opcionais. |
| Pendências | Consulta de fontes, Quick Wins, acessos, aprovações, conectores e relatos autorizados. Busca, assunto, paginação e links para as telas responsáveis. Avisos históricos não afirmam que um bloqueio continua ativo. |
| Governança do Conhecimento | Responsável com acesso à base, validade, suspensão reversível e histórico de metadados. Fontes suspensas ou vencidas não entram em novas consultas da IA. |
| Dependências | Documentos mostram Quick Wins gerenciados que usam a base; conectores mostram vínculos declarados ou execuções anteriores, somente dentro das permissões. |
| Detalhe de execução | Resumo progressivo na conversa privada: fontes registradas, resposta preparada, conferência e referência ao painel de ações externas. Não inventa horários ou execução externa. |
| Integrações e aprovações | Ajuda contextual e impacto dos conectores. O mecanismo existente de aprovação de escritas permanece obrigatório. Consulta de impacto não executa chamadas externas. |
| Comparação de versões | Dois números de versão, diferenças em campos de negócio e restauração existente com confirmação. Comparar não restaura automaticamente. |
| Resultados | Identificação explícita de consumo medido, avaliações informadas e estimativas de benefício. Gestores também acessam medição do Quick Win 2.0. |
| Auditoria legível | Detalhes progressivos, nomes de campos e autor. Antes/depois apresentado quando registrado, incluindo alterações de metadados de documentos. |
| Ajuda contextual | Orientações fixas por tela, teclado, Escape e retorno de foco. Não consulta IA nem consome créditos. |
| Revisão de acessos | Conferência registrada de áreas, grupos e administração das bases. Vínculos alterados ou revisão com mais de 90 dias pedem nova conferência. Não altera permissões nem revoga sessões. Perfis da plataforma continuam em Usuários. |
| Filtros salvos | Uma consulta por recurso e conta neste navegador: Conhecimento, Pendências, Quick Wins, Uso e Atividade. Sem sincronização entre dispositivos. |

## Preservação e autorização

- Novas tabelas são aditivas; documentos antigos permanecem vigentes por padrão. Índice, texto e arquivos não são reescritos na inicialização.
- Antes da primeira criação das tabelas em banco persistente existente, `VACUUM INTO` gera backup local consistente comprimido. Falha de backup impede a abertura desse banco. Respeita `BACKUP_PASTA` e a retenção existente; no modo multiempresa usa subpasta por empresa. O backup inicial desta evolução não implica upload para S3.
- Histórico guarda metadados e hash do texto, sem cópias do conteúdo antigo. Exclusão de documento elimina seus registros em cascata.
- Conferência de acesso registra a assinatura dos vínculos locais. Não substitui revisão de perfis granulares da plataforma, nem valida automaticamente se cada permissão é adequada.
- Administração não ganha acesso ao conteúdo das conversas pessoais. Dependências e comparações respeitam a autorização do servidor.
- A validade considera a data no fuso `PLATAFORMA_FUSO`, com Brasília (`America/Sao_Paulo`) como padrão, inclusive durante a virada de dia em UTC.
- Fontes vencidas ou suspensas deixam de ser recuperadas em novas respostas; isso não reescreve respostas já geradas ou remove anexos enviados manualmente.
- A UX usa apresentação progressiva, campos rotulados, controles de toque e orientação em linguagem simples. A estrutura de aplicação e o design system existente foram preservados.

## Validação

Resultado final: 755 testes de servidor aprovados em 88 arquivos, sem falhas ou skips no conjunto final. Cada arquivo foi executado sequencialmente com `node --test --test-force-exit`; a suíte visual inicialmente sem Chromium teve 10 falhas de configuração e foi repetida com `CHROMIUM_PATH` configurado (13/13 aprovados). As últimas alterações de vigência também passaram em 18/18 testes de governança e bases. Sintaxe validada nos 24 arquivos JavaScript e `git diff --check` aprovado. Testes usam IA e serviços externos simulados; não comprovam credenciais, entregas de e-mail ou operações reais de terceiros em produção.

Novos testes cobrem isolamento entre áreas e empresas, permissões granulares, exclusão em cascata, validade e calendário inválido, suspensão e retomada da recuperação, backup anterior ao esquema com `integrity_check`, responsabilidade por base, comparação autorizada, revisão de acessos e consulta de impacto sem execução externa.

A execução completa de navegador teve 77/79 aprovados inicialmente: a expectativa antiga de quatro destinos precisou incluir Pendências, e o menu de 320×568 perdeu a visibilidade de Ver todas. O teste passou a exigir os cinco destinos; a lista de recentes foi compactada em telas baixas, preservando os alvos de toque. Os dois casos corrigidos foram repetidos e aprovados (2/2), além da repetição das oito novas jornadas (8/8). Todos os 79 cenários estão aprovados entre essas execuções.

Jornadas de navegador cobrem preparação, pendências, governança de fontes, falha de rede preservando a edição, filtros, ajuda com Escape e retorno de foco, comparação, resultados, auditoria e privacidade da execução. Layouts inspecionados em 320, 390, 768 e 1280 pixels, sem overflow horizontal nas novas telas.

## Recuperação

Se houver problema visual, corrigir ou reverter o frontend preservando o backend de governança. Depois que fontes recebem suspensão ou validade, voltar integralmente à imagem anterior faria o código antigo ignorar essas restrições. Restaurar banco exige procedimento operacional com servidor parado, verificação de integridade e avaliação das alterações posteriores ao backup; não é uma ação automática desta entrega.

## Limite da verificação em produção

A validação autenticada das novas jornadas em produção requer uma sessão válida. Publicação e página pública não equivalem a QA autenticado de todos os perfis, nem a operações externas reais. Nenhuma credencial ou código de acesso é registrado neste relatório.
