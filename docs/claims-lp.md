# Afirmações comerciais × comportamento real

Fonte de verdade: o comportamento implementado (versão `c255402`, em produção), e não o texto da página. Quando
a página e o produto divergem, a página muda; o produto não muda para parecer mais verdadeiro.

Cada afirmação da página de vendas (`public/vendas.html`) que fale de segurança, dados, informação sigilosa,
retenção, treino, fornecedores, acesso, créditos ou continuidade tem:

- o trecho que está na página;
- a regra que ele promete;
- a implementação dessa regra;
- o teste que comprova a regra;
- o status e, quando houver, a limitação.

O teste `test/claims-lp.test.js` lê a tabela "Afirmações atuais" e confere cada linha:

- o trecho está na página;
- o arquivo citado contém o símbolo;
- o teste citado existe.

O mesmo teste também impede que voltem as afirmações corrigidas, lista mais abaixo.

**Status**

| Status | Significado |
|---|---|
| VERDADEIRO | Comprovado por código e teste |
| VERDADEIRO COM RESSALVA | Comprovado, com uma limitação registrada na coluna de observação |
| ILUSTRATIVO | Tela de exemplo, com dados fictícios e aviso na própria tela |
| REMOVIDO | Saiu da página, com o motivo |
| PENDÊNCIA DE PRODUTO | Limitação real do produto. A página não a esconde e não promete o contrário |

## Afirmações atuais

| id | trecho na página | regra | implementação | teste | status | observação |
|---|---|---|---|---|---|---|
| C1 | `A GreenIA verifica cada mensagem e anexo antes do processamento` | A classificação e a política acontecem antes de qualquer envio, sobre a mensagem e os anexos juntos (inclusive os lidos por OCR) | `src/conversas.js` → `detectar([texto, ...anexos` | `API, nova tentativa, anexo e streaming: a mesma governança em todo envio` | VERDADEIRO | Mensagem e anexo. Documentos da base de conhecimento e arquivos de quick win seguem a marcação do documento (ver P1) |
| C2 | `Identifica CPF, CNPJ, dados bancários, cartões, chaves PIX e credenciais antes do envio` | Detecta os tipos antes do envio | `src/filtro.js` → `export function detectar` | `classificação: CPF, CNPJ, cartão, banco, PIX, senha e API key detectados; categorias distintas` | VERDADEIRO | Detectar não é proteger: o tratamento é a regra de cada tipo (C3) |
| C3 | `aplica a regra que a empresa definiu para cada tipo: processar normalmente, só com proteção ou não enviar` | Cada tipo tem uma das três ações, definida pela empresa, proporcional ao risco | `src/filtro.js` → `export function decidir` | `filtro no servidor: CPF é dado pessoal e segue normalmente por padrão; proteger e bloquear são política da empresa; credencial nunca sai` | VERDADEIRO | Padrão: CPF e CNPJ processam normalmente; cartão, banco, PIX, dado sensível e confidencial só com proteção |
| C4 | `aplica automaticamente as políticas da empresa` | A política da empresa vale no servidor, em todo envio | `src/filtro.js` → `export function decidir` | `filtro no servidor: CPF é dado pessoal e segue normalmente por padrão; proteger e bloquear são política da empresa; credencial nunca sai` | VERDADEIRO | |
| C5 | `Permita o uso de informações sigilosas com guardrails de proteção` | Com a opção desligada (o padrão), nada sigiloso é enviado. Ligada, só segue por rota autorizada e elegível | `src/sigilo.js` → `export function avaliarProcessamentoSigiloso` | `política OFF: informação sigilosa nunca é enviada; nada gravado; sem marcar a conversa; mensagem simples` | VERDADEIRO | |
| C6 | `só processa o conteúdo quando todos os controles e recursos autorizados estiverem disponíveis` | Avaliação da rota real, fechada em caso de dúvida; bloqueio antes do envio, com registro e aviso ao admin | `src/sigilo.js` → `export function avaliarRecurso` | `política ON + guardrail inválido, autorização ausente ou desconhecida: nunca envia; admin avisado uma vez` | VERDADEIRO | |
| C7 | `Ninguém precisa escolher modelos ou fornecedores` | O modelo pedido é só preferência, e nada técnico chega a quem usa | `src/conversas.js` → `const solicitado =` | `nunca expor provider: respostas para quem usa não citam OpenRouter, fornecedor, rota nem identificador técnico` | VERDADEIRO | |
| C8 | `as pessoas confirmam que tomaram ciência` | Uma nova versão da política bloqueia o envio até a ciência, que fica registrada | `src/politica.js` → `export function sincronizarPolitica` | `política: a seção automática muda com a política de informação sigilosa e gera nova versão; nunca cita fornecedor; preço não; ciência pendente bloqueia o envio` | VERDADEIRO | |
| C9 | `apoiam as políticas de segurança, confidencialidade e proteção de dados da empresa` | Controles, não promessa jurídica | `src/politica.js` → `A empresa continua responsável por suas obrigações legais e regulatórias` | `política: a seção automática muda com a política de informação sigilosa e gera nova versão; nunca cita fornecedor; preço não; ciência pendente bloqueia o envio` | VERDADEIRO | Sem claim de LGPD ou compliance |
| C10 | `Cada resposta consome créditos de acordo com a classe e as características da solicitação` | Consumo pelo custo real da resposta, sem o preço exposto a quem não é operador | `src/plano.js` → `export function situacaoPlano` | `mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email` | VERDADEIRO | |
| C11 | `A GreenIA escolhe a classe automaticamente` | O roteamento escolhe entre os elegíveis: primeiro as restrições, depois as preferências | `src/roteador.js` → `export const RESTRICOES` | `invariante (propriedade): 120 entradas aleatórias de API nunca executam modelo proibido` | VERDADEIRO | Roteamento automático ligado por padrão; o admin pode desligar e usar a classe padrão |
| C12 | `O administrador recebe um alerta` | Aviso em 80%, 100%, perto do fim da reserva e no esgotamento | `src/plano.js` → `export async function verificarAvisos` | `mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email` | VERDADEIRO | |
| C13 | `A reserva nunca muda as regras` | A reserva operacional não autoriza nenhum recurso | `src/roteador.js` → `plano_na_reserva` | `reserva do plano: créditos no fim continuam só com recurso autorizado; sem ele, nada é enviado` | VERDADEIRO | |
| C14 | `quando a garantia de uma rota não é conhecida, ela não é usada` | Fechado em caso de dúvida: um atributo desconhecido nunca vale como permitido | `src/sigilo.js` → `Fail closed` | `camada central: fail closed; desconhecido nunca vale como permitido` | VERDADEIRO | |
| C15 | `primeiro as regras de segurança e de governança, depois a capacidade necessária, e só então o custo` | O custo nunca supera a autorização | `src/roteador.js` → `PREFERÊNCIAS (soft)` | `economia nunca supera autorização: o barato não autorizado nunca é usado, mesmo para pedido simples` | VERDADEIRO | |
| C16 | `Informações sigilosas` | O fallback e a nova tentativa só usam recursos que passam nos guardrails | `src/conversas.js` → `rotaSigilo = conferirEnvio(alt.modelo)` | `fallback: principal indisponível → outro recurso SÓ se autorizado e elegível; senão, nada mais é enviado` | VERDADEIRO | |
| C17 | `CNPJ · identificação de empresa` | CNPJ é identificação de empresa, processado normalmente, sem os controles de dado pessoal | `src/filtro.js` → `cnpj: 1` | `uso: CNPJ sozinho processa normalmente, sem controles de dado pessoal; com CPF do representante, os controles valem pelo CPF` | VERDADEIRO | Tela ilustrativa (D1) |
| C18 | `Processado com controles de dado pessoal` | CPF processa normalmente por padrão, exigindo recurso compatível e pedido sem uso para treino | `src/conversas.js` → `const dadosPessoais =` | `uso: CNPJ sozinho processa normalmente, sem controles de dado pessoal; com CPF do representante, os controles valem pelo CPF` | VERDADEIRO | Tela ilustrativa (B3). CPF não é confidencial por padrão |
| C19 | `marcada CONFIDENCIAL` | Confidencial pela marcação explícita (ou documento, quick win, área ou ação manual), nunca por "ser uma proposta" | `src/filtro.js` → `REGRAS.confidencial` | `10-13. dado sensível e informação confidencial: só com guardrails; sem recurso autorizado ou com a opção desligada, nada sai` | VERDADEIRO | Tela ilustrativa (D2). "Recurso autorizado" vale com a opção de informação sigilosa ligada |
| C20 | `em mensagens e anexos` | Credenciais em mensagens e anexos (inclusive os lidos por OCR) são bloqueadas antes de qualquer envio | `src/conversas.js` → `bloqueados.includes('credencial')` | `segredos em texto, PDF, PPTX, imagem e PDF escaneado (OCR): bloqueados antes de qualquer envio, sem guardar` | VERDADEIRO | A mesma regra vale também para base de conhecimento, quick win e histórico (P1 resolvida) |
| C21 | `Esgotada a reserva, novas mensagens pausam até a renovação ou um novo pacote` | Fim da reserva: bloqueio até a renovação ou um pacote | `src/plano.js` → `plano_esgotado` | `mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email` | VERDADEIRO | |
| C22 | `cujos atributos declarados, como retenção zero e ausência de uso para treino, atendem aos requisitos exigidos` | A elegibilidade usa os atributos declarados de cada recurso ou rota | `src/sigilo.js` → `export function atributosDoRecurso` | `elegibilidade por atributos: recursos equivalentes são elegíveis; um rótulo não substitui o atributo real` | VERDADEIRO COM RESSALVA | A GreenIA não verifica tecnicamente o comportamento do fornecedor: aplica o que foi declarado e autorizado |
| C23 | `Entram pessoas com email dos domínios autorizados ou convidadas pelo admin` | Domínio autorizado, pessoa cadastrada pelo admin ou operador da plataforma | `src/auth.js` → `export function podeEntrar` | `fora dos domínios, só entra quem o admin cadastrou; ADMIN_EMAIL é sempre admin` | VERDADEIRO | Operadores da plataforma também entram (suporte) |
| C24 | `banco de dados, usuários, marca e regras separados das outras empresas` | Um banco (arquivo) por empresa; nada de uma empresa é alcançável pela outra | `src/plataforma/servidor.js` → `pastaEmpresas` | `isolamento: nada da empresa A é alcançável a partir da empresa B` | VERDADEIRO COM RESSALVA | Isolamento lógico. O serviço e os fornecedores de IA são compartilhados; não é servidor dedicado |
| C25 | `recebem a mensagem, os anexos, o histórico da conversa e os trechos de documentos usados na resposta` | O que vai para a IA em cada resposta | `src/conversas.js` → `function historico(` | `guardar = não: texto, PDF, PPTX, imagem e PDF escaneado são processados por inteiro e não deixam rastro` | VERDADEIRO | Também as instruções do quick win e da empresa |
| C26 | `A empresa passa a ver os tipos de dado e a classe usada em cada resposta` | Cada resposta registra os tipos de dado (sem os valores) e a classe, na Atividade | `src/conversas.js` → `registrar(app, 'conversation.completed'` | `retenção: guardar = sim; guardar = não (processa, entrega, nada fica em banco, log, evento ou erro); bloqueado` | VERDADEIRO | O fornecedor não aparece para a empresa |
| C27 | `a troca pode ser feita na classe` | A troca do recurso de uma classe é configuração, com aviso aos admins | `src/modelos.js` → `function avisarModeloAlterado` | `troca do modelo por trás de uma classe avisa os admins, sem tom de erro` | VERDADEIRO | Não é automática |
| C28 | `Plano por créditos, não por pessoa` | O preço é do plano; não existe preço por assento | `src/plataforma/empresas.js` → `price_usd: 290` | `planos por configuração: limite de usuários, recursos e mudança de plano valem na hora` | VERDADEIRO COM RESSALVA | O operador pode definir limite de usuários por plano; a página não promete "pessoas sem limite" |

## Telas ilustrativas

Todas têm aviso na própria tela: "Dados fictícios para demonstração", "Exemplo ilustrativo" ou "Tela ilustrativa, com dados fictícios".

| tela | status | o que mostra |
|---|---|---|
| Visão geral (topo) | ILUSTRATIVO | A Administração como é no produto: alternador "Usar GreenIA | Administração", menu da Administração ("Áreas e grupos", como na versão multiempresa), números fictícios |
| Envio com CNPJ, CPF e proposta marcada | ILUSTRATIVO | O tratamento de cada tipo pelas regras padrão (C17 a C20) |
| Quick win em avaliação | ILUSTRATIVO | 128 execuções, 82% serviu, 9 pessoas e 45 → 12 min são fictícios, não resultados medidos |
| Créditos do ciclo | ILUSTRATIVO | 20.480 de 25.000 e a divisão 58/31/11% são fictícios |
| Empresa A e Empresa B | ILUSTRATIVO | Os créditos do mês são fictícios |

## Afirmações corrigidas ou removidas

| antes | status | motivo |
|---|---|---|
| "CNPJ · identificação · Protegido" | REMOVIDO (D1) | CNPJ é processado normalmente, sem controles |
| "Proposta do cliente · confidencial · Recurso autorizado" | REMOVIDO (D2) | Uma proposta não é confidencial pelo conteúdo; o exemplo agora mostra a marcação explícita |
| Texto de acessibilidade "…CPF e CNPJ … guardrails de proteção aplicados" | REMOVIDO (D3) | Os guardrails de sigilo não se aplicam a CPF ou CNPJ por padrão |
| Menu único com "Trabalho" e "Gestão" | REMOVIDO (D4) | O produto separa "Usar GreenIA" e "Administração" |
| "Proteção antes do envio" | REMOVIDO (B1) | Detectar não é proteger; cada tipo tem a sua regra |
| "Senhas e credenciais · Nunca enviadas" (sem escopo) | Ajustado (B2) | Vale para mensagens e anexos (C20, P1) |
| "CPF · dado pessoal · Protegido" | REMOVIDO (B3) | O padrão é processar com os controles de dado pessoal |
| "…rotas autorizadas que atendam aos requisitos, como retenção zero…" | Ajustado (B4) | Atributos declarados, não verificados (C22) |
| "Só domínios autorizados pelo admin entram" | Ajustado (B5) | Convidados e operadores também entram (C23) |
| "Infraestrutura privada" e selo "Isolado" | REMOVIDO (B6) | Isolamento lógico, em serviço compartilhado (C24) |
| "…segue disponível na classe Rápido … até a renovação" | Ajustado (B7) | Só enquanto houver reserva; depois, pausa (C21) |
| "Os recursos de IA recebem só o necessário para responder" | REMOVIDO (B8) | Não é mensurável; a página diz o que é enviado (C25) |
| "Regras de dados aplicadas antes de cada envio" (genérico) | Ajustado (B9) | Mensagem e anexo (C1) |
| "Ninguém sabe quais dados saíram, nem para qual serviço" | REMOVIDO (B10) | A GreenIA mostra tipos de dado e classe, não o serviço (C26) |
| "…a troca é feita na classe" | Ajustado (B11) | É configuração, não automática (C27) |
| "Sem cobrança por pessoa / Pessoas sem limite" | Ajustado (B12) | Os planos de produção não foram confirmados; a página fala do modelo de cobrança (C28) |
| Tabela "Ferramenta individual × GreenIA" | REMOVIDO (C3 da auditoria) | Generalizações sobre produtos de terceiros; a tabela mostra só o que a GreenIA faz |
| "Respondemos por email para marcar uma apresentação com o ambiente funcionando" e "A implantação é feita junto…" | Ajustado | Compromissos de atendimento, apresentados como serviço, sem prazo ou SLA |

## Pendências de produto

| id | pendência | status | efeito na página |
|---|---|---|---|
| P1 | Credenciais em documentos da base de conhecimento e arquivos de quick win passavam direto para o contexto da IA, sem a classificação de credenciais aplicada a mensagens e anexos | RESOLVIDA NO PRODUTO | A mesma regra (`contemCredencial`, em `src/filtro.js`) agora confere cada parte do envio: instruções, arquivos do quick win, trechos e títulos da base, histórico e o payload final (`test/credenciais-contexto.test.js`). A página continua dizendo "em mensagens e anexos", o que é verdadeiro. Ampliar a frase é decisão de comunicação separada |

## Classificação das afirmações antigas (histórico)

| Afirmação antiga | Classificação | O que aconteceu |
|---|---|---|
| "Dados sensíveis vão só para modelos homologados, com fornecedor fixo, retenção zero e sem uso para treino." | Depende do recurso e da configuração | Virou uma condição explícita sobre atributos declarados (C22) |
| "CPF … Bloqueado" (demonstração) | Não é garantido pelo produto | CPF é processado com controles de dado pessoal por padrão; bloquear é escolha da empresa |
| "Ao chegar a 100%, a GreenIA segue na classe Rápido dentro de uma reserva." | Verdadeiro, com qualificação | "pode continuar … enquanto houver reserva" (C21) |
| "A empresa escolhe quais [modelos] são homologados para dados sigilosos." | Expunha decisão técnica | A GreenIA escolhe entre os recursos permitidos (C7) |
| Qualquer "compliance garantido" ou "LGPD 100%" | Promessa jurídica | Não existe na página; o teste proíbe |
