# Código e sites: operações protegidas

Conversar sobre programação, explicar código e mostrar exemplos em texto é livre para todos. As quatro operações
abaixo dependem de permissão no perfil da pessoa (Pessoas › Perfis). A política da empresa (Configurações ›
Políticas › Código e sites) pode proibir cada uma para todos, e vale por cima do perfil. O servidor confere a
permissão a cada uso, então revogar vale na hora, inclusive para conversas já abertas e sites já publicados.

| Operação | Permissão | O que acontece |
|---|---|---|
| Criar sites e aplicativos | `code.project` | O código da resposta vira projeto: prévia funcionando (página isolada) e `.zip` com os arquivos. |
| Executar código ou testes | `code.execute` | O projeto roda numa área isolada **no navegador de quem pediu**, e a saída real aparece na conversa. |
| Acessar ou alterar repositórios | `code.repo` | Lê repositórios do GitHub liberados pela empresa. Alterações viram **Pull Request** num branch novo. |
| Publicar ou fazer deploy | `code.publish` | O site gerado ganha um endereço público na GreenIA (`/<empresa>/s/<código>`), isolado e sem indexação. |

## Executar

- **Onde roda:** num iframe em *sandbox* com origem opaca. A execução não tem acesso aos cookies nem às APIs da GreenIA e não tem rede, exceto a CDN do Pyodide, de onde vêm o Python e os pacotes científicos. Nada roda no servidor.
- **JavaScript:** módulos ES ou CommonJS, com versões simplificadas de `node:assert` e `node:test`. Pacotes externos do npm não estão disponíveis.
- **Python:** Pyodide (WebAssembly). Testes em `test_*.py`, com `unittest` ou funções `test_` no estilo pytest. Pacotes como numpy e pandas são carregados sob demanda.
- **Limite de tempo:** 45 s em JavaScript e 90 s em Python, incluindo o carregamento do Pyodide. Um laço infinito é interrompido.
- **O que fica registrado:**
  - a saída, até 20.000 caracteres;
  - um aviso na conversa;
  - o evento `code.executed`.
- **Uso pela IA:** a saída vai uma única vez como material da próxima mensagem, para pedidos como "corrija o que falhou".

## Repositórios (GitHub)

1. **Conectar:** o admin conecta em Configurações › Políticas › Repositórios e sites publicados. Ele informa um token de acesso fino (fine-grained) e a lista de repositórios no formato `dono/nome`. O token e cada repositório são conferidos no GitHub ao salvar.
2. **Guarda do token:** o token fica cifrado (AES-256-GCM com a chave-mestra) e nunca volta para a tela nem vai para a IA.
3. **Leitura:** quando a pessoa cita um repositório liberado, o conteúdo do branch padrão vira material da conversa, com os mesmos limites e a mesma regra de segredos dos anexos.
   - O material inclui a estrutura completa e até 80 arquivos de código (250 KB).
   - Se o material tiver uma credencial, a mensagem é bloqueada.
4. **Alteração:** os arquivos da resposta (`### Arquivo: caminho`) viram um commit num branch `greenia/<data>-<código>`, e a GreenIA abre um Pull Request contra o branch padrão.
   - Nada é gravado direto no branch principal; o merge é sempre humano.
   - Fica registrado o evento `code.repo_pr`.
5. **Fora da lista:** um repositório que não está na lista liberada não é lido.

## Publicar

- **O que é publicado:** uma cópia do site no momento da publicação. Mudanças posteriores na conversa não alteram o site publicado.
- **Isolamento:** a página é servida com `Content-Security-Policy: sandbox`, sem rede (`connect-src 'none'`), sem envio de formulários e com `X-Robots-Tag: noindex`.
- **Quando sai do ar:**
  - ao despublicar, por quem publicou ou pelo admin, pelo cartão na conversa ou pela lista no admin;
  - quando a empresa proíbe "Publicar projetos";
  - quando quem publicou perde a permissão ou deixa a empresa;
  - quando a conversa é excluída, inclusive pela retenção.
- **Eventos:** `code.published` e `code.unpublished`.
- **Atenção:** o endereço fica no domínio da GreenIA ou no endereço próprio da empresa. Libere a permissão só para quem pode publicar em nome da empresa.
