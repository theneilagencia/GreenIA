# Modelos: histórico legível e recuperação de carregamento

Data: 2026-10-06. Base de produção: 173d43e.

## Diagnóstico

As capturas enviadas mostram a versão 2379876. Na sessão autenticada de vinicius@apymine.com em 173d43e, Modelos → Roteamento carregou os controles, indicadores e decisões normalmente. Não foi reproduzida a mensagem genérica da captura; não há evidência suficiente para atribuir uma causa ao episódio. Erros de extensão do navegador foram separados dos erros da aplicação.

Modelos → Histórico continuava apresentando JSON bruto, reproduzido em produção. A tela passou a usar o componente de auditoria legível, com rótulos para campos de configuração, booleanos e estrutura expansível. Valores continuam escapados.

Falhas de leitura em telas administrativas agora apresentam contexto e um botão Tentar novamente. A nova tentativa carrega a tela novamente sem salvar configuração. Falha tardia de uma tela abandonada não substitui a tela atual.

## Validação local

- 24 testes focados aprovados: 13 de roteamento HTTP e 11 de navegador, incluindo acompanhamento e 3 cenários novos de administração.
- Suite completa de navegador: 82 aprovados, 0 falhas, 0 ignorados.
- Primeiro ensaio do novo teste teve um seletor inexistente; corrigido para #cfg-rota, com execução focada e suite completa aprovadas.
- Sem mudanças de schema, motor de roteamento, política, credencial ou dependência.

## Verificação autenticada de produção antes da publicação

- Sessão autenticada pela entrada segura de credenciais; versão e conta conferidas.
- Roteamento: leitura de configuração, estatísticas e decisões aprovada.
- Histórico: apresentação bruta reproduzida e corrigida no código.
- Preparação: seis verificações calculadas e links para telas responsáveis.
- Pendências: lista por assunto carregada; distingue aviso histórico de governança de bloqueio ativo.
- Conhecimento: catálogo, gestão, edição, responsável e histórico. Responsável definido como o usuário de QA somente no documento fictício QA - Aurora fictícia 05-10-2026. Reabertura confirmou persistência e registro da alteração.
- Dependências: links de Quick Wins associados ao documento carregados.
- Execução histórica de integração: consulta e gravação concluídas no painel; nova explicação distingue registro da resposta do estado atual das ações.
- Quick Win arquivado de QA: execuções, medição e versões acessíveis. Não reativado nem executado novamente nesta rodada.

Este registro não certifica ausência de todos os defeitos possíveis. Pendências de cadastro e integrações de teste com falhas intencionais não equivalem automaticamente a bugs. Não foram alterados acessos, políticas, segredos nem excluídos registros para zerar a lista.
