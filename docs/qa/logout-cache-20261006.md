# Logout e histórico do navegador

Defeito reproduzido em produção em 9d8c8dc: após sair, Voltar restaurava o DOM da tela privada via histórico/cache do navegador. Recarregar encaminhava para /entrar, confirmando que a sessão no servidor estava encerrada. O problema era a exibição restaurada, sem evidência de sessão reativada.

Correção: ao confirmar logout, apaga o conteúdo da página e substitui o endereço no histórico. Ao congelar um documento no back/forward cache, apaga seu DOM; ao restaurá-lo, recarrega e exige a consulta normal da sessão. Falha de logout continua preservando a sessão e apresentando aviso. Falha de leitura inicial agora apresenta Tentar novamente; redirecionamento por 401 é tratado sem rejeição não capturada.

O novo cenário usa Chromium com back/forward cache habilitado (Playwright o desativa por padrão), passa por saída e retorno com sessão válida, registra navegações anteriores e verifica que Voltar depois do logout pede nova entrada e não mostra #principal nem #sair. Outro cenário injeta 503 na leitura inicial, verifica apresentação escapada e nova tentativa sem perda de sessão.

Validação: regressão completa de navegador concluída: 85 aprovados, 0 falhas, 0 ignorados. A primeira rodada identificou uma rejeição não capturada de sem sessão; foi corrigida com status 401 explícito e tratamento da inicialização. Rodada focada seguinte: 10 aprovados, 0 falhas.

A mudança não altera tempo de sessão, identidade, credenciais, permissões nem banco de dados. Páginas que já tenham sido carregadas com versões anteriores precisam ser atualizadas para receber os novos handlers.
