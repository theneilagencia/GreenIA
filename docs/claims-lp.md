# Afirmações comerciais × comportamento real

Cada afirmação da página de vendas (`public/vendas.html`) e da landing da empresa (`public/index.html`) que
fale de segurança, informação sigilosa, retenção, treino, fornecedores, créditos ou continuidade precisa ter
quatro coisas:

- o trecho que está na página;
- a regra que ele promete;
- a implementação dessa regra;
- o teste que comprova a regra.

O teste `test/claims-lp.test.js` lê a tabela abaixo e confere quatro pontos em cada linha: o trecho existe na
página, o arquivo da implementação contém o símbolo citado, o teste citado existe e nenhuma frase proibida
aparece nas páginas. Tirar um elo quebra o teste.

## Classificação das afirmações antigas

| Afirmação antiga | Classificação | O que aconteceu |
|---|---|---|
| "Dados sensíveis vão só para modelos homologados, com fornecedor fixo, retenção zero e sem uso para treino." | Depende do recurso e da configuração | Virou uma condição explícita: a GreenIA só usa rotas autorizadas cujos atributos estão comprovados, e rota com garantia desconhecida não é elegível |
| "CPF … Bloqueado" (demonstração) | Não é garantido pelo produto (é política da empresa) | CPF é classificado e protegido por padrão; bloquear é escolha da empresa |
| "Em conversas sigilosas, só fornecedores homologados, com retenção zero e sem uso para treino." | Verdadeiro, mas precisa de qualificação | Reescrita como "só por rotas autorizadas que atendam aos requisitos definidos; quando a garantia de uma rota não é conhecida, ela não é usada" |
| "Ao chegar a 100%, a GreenIA segue na classe Rápido dentro de uma reserva." | Verdadeiro, mas precisa de qualificação | "pode continuar atendendo solicitações elegíveis na classe Rápido, dentro da reserva operacional do plano", deixando claro que a reserva não muda as regras |
| "A empresa escolhe quais [modelos] são homologados para dados sigilosos." | Verdadeiro, mas expunha decisão técnica | A GreenIA escolhe automaticamente entre os recursos permitidos, e quem usa não escolhe nada |
| "Ninguém precisa entender tokens" / créditos | Verdadeiro e comprovado | Mantido, com o esclarecimento de que o crédito não é uma unidade técnica |
| Qualquer "compliance garantido" ou "LGPD 100%" | Promessa jurídica | Não existe na página. O teste proíbe essas frases e exige a frase de responsabilidade |

## Afirmações atuais

| id | trecho na página | regra | implementação | teste |
|---|---|---|---|---|
| C1 | `A GreenIA verifica cada mensagem e cada anexo antes do processamento` | A classificação e a política acontecem antes de qualquer envio, sobre a mensagem e os anexos juntos | `src/conversas.js` → `detectar([texto, ...anexos` | `API, nova tentativa, anexo e streaming: a mesma governança em todo envio` |
| C2 | `podem ser identificadas antes do envio` | Detecta CPF, CNPJ, cartão, banco, PIX e credenciais | `src/filtro.js` → `export function detectar` | `classificação: CPF, CNPJ, cartão, banco, PIX, senha e API key detectados; categorias distintas` |
| C3 | `A empresa define o que pode ser processado e em quais condições` | O tratamento de cada tipo é política da empresa (processar com proteção ou não enviar) | `src/filtro.js` → `export function decidir` | `filtro no servidor: CPF é classificado e protegido por padrão; bloquear é política da empresa; credencial nunca sai` |
| C4 | `Permitir processamento de informações sigilosas com guardrails de proteção` | Com a opção desligada (o padrão), nada sigiloso é enviado. Ligada, só segue por rota autorizada e elegível | `src/sigilo.js` → `export function avaliarProcessamentoSigiloso` | `política OFF: informação sigilosa nunca é enviada; nada gravado; sem marcar a conversa; mensagem simples` |
| C5 | `só utiliza recursos autorizados e compatíveis com as regras da empresa` | Avaliação da rota real (fornecedor, endpoint, retenção, treino, autorizações), fechada em caso de dúvida | `src/sigilo.js` → `export function avaliarRecurso` | `política ON + guardrail inválido, autorização ausente ou desconhecida: nunca envia; admin avisado uma vez` |
| C6 | `Quando não existe um, o conteúdo não é enviado e o administrador é informado` | Bloqueio antes do envio, registro e aviso ao admin | `src/conversas.js` → `sem_recurso_elegivel` | `política ON + guardrail inválido, autorização ausente ou desconhecida: nunca envia; admin avisado uma vez` |
| C7 | `Ninguém precisa escolher modelos, fornecedores ou configurações técnicas` | O modelo pedido é só preferência, e nada técnico chega a quem usa | `src/conversas.js` → `const solicitado =` | `nunca expor provider: respostas para quem usa não citam OpenRouter, fornecedor, rota nem identificador técnico` |
| C8 | `as pessoas registram que tomaram ciência` | Uma nova versão da política bloqueia o envio até a ciência | `src/politica.js` → `export function sincronizarPolitica` | `política: a seção automática muda com a política de informação sigilosa e gera nova versão; nunca cita fornecedor; preço não; ciência pendente bloqueia o envio` |
| C9 | `apoiam as políticas de segurança, confidencialidade e proteção de dados da empresa` | Controles, não promessa jurídica | `src/politica.js` → `A empresa continua responsável por suas obrigações legais e regulatórias` | `política: a seção automática muda com a política de informação sigilosa e gera nova versão; nunca cita fornecedor; preço não; ciência pendente bloqueia o envio` |
| C10 | `Cada resposta consome créditos de acordo com a classe e as características da solicitação` | Consumo por classe, sem o preço exposto a quem não é operador | `src/plano.js` → `export function situacaoPlano` | `mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email` |
| C11 | `A GreenIA escolhe a classe automaticamente` | O roteamento escolhe entre os elegíveis: primeiro as restrições, depois as preferências | `src/roteador.js` → `export const RESTRICOES` | `invariante (propriedade): 120 entradas aleatórias de API nunca executam modelo proibido` |
| C12 | `O administrador recebe um alerta` | Aviso em 80% | `src/plano.js` → `export async function verificarAvisos` | `mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email` |
| C13 | `A reserva nunca muda as regras` | A reserva operacional não autoriza nenhum recurso | `src/roteador.js` → `plano_na_reserva` | `reserva do plano: créditos no fim continuam só com recurso autorizado; sem ele, nada é enviado` |
| C14 | `quando a garantia de uma rota não é conhecida, ela não é usada` | Fechado em caso de dúvida: um atributo desconhecido nunca vale como permitido | `src/sigilo.js` → `Fail closed` | `camada central: fail closed; desconhecido nunca vale como permitido` |
| C15 | `primeiro as regras de segurança e de governança, depois a capacidade necessária, e só então o custo` | O custo nunca supera a autorização | `src/roteador.js` → `PREFERÊNCIAS (soft)` | `economia nunca supera autorização: o barato não autorizado nunca é usado, mesmo para pedido simples` |
| C16 | `Informações sigilosas` | O fallback e a nova tentativa só usam recursos que passam nos guardrails | `src/conversas.js` → `rotaSigilo = conferirEnvio(alt.modelo)` | `fallback: principal indisponível → outro recurso SÓ se autorizado e elegível; senão, nada mais é enviado` |
