// Generalização da produção visual: 20 pedidos visuais inéditos, de áreas diferentes, com o motor CONGELADO
// (nenhum código específico por pedido). Executa uma vez e registra o resultado, sem tentar de novo.
//
//   node scripts/qa-visual-surpresa.mjs [pasta-de-saida]
//
// Para cada pedido: a leitura do pedido sem IA (plano heurístico + invariantes) precisa reconhecer que há um
// artefato visual; o conteúdo é o que a execução escreveria seguindo o prompt de peças visuais (texto fictício
// abaixo); o motor monta, confere e corrige; as páginas viram PNG para a revisão humana. Saída: relatorio.json e as
// imagens. Sem rede e sem IA.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planoHeuristico } from '../src/quickwin-construtor.js';
import { garantirInvariantes } from '../src/quickwin-interpretacao.js';
import { analisarConteudo } from '../src/visual/conteudo.js';
import { planejar } from '../src/visual/plano.js';
import { limparVisual, tracos } from '../src/visual/contrato.js';
import { resolverIdentidade } from '../src/visual/marca.js';
import { produzir } from '../src/visual/motor.js';
import { pngDaPagina } from '../src/visual/raster.js';
import { pdfDasPaginas } from '../src/visual/pdf.js';
import { FORMATOS } from '../src/visual/contrato.js';

const SAIDA = process.argv[2] || join('capturas', 'tmp', 'surpresa');
mkdirSync(SAIDA, { recursive: true });

export const SURPRESA = [
  { area: 'RH', pedido: 'Monte um one-page de boas-vindas para novos colaboradores com benefícios e primeiros passos.', conteudo: `Título: Bem-vindo à Empresa Exemplo

Seu primeiro mês, em uma página.

### Benefícios
- Vale-refeição: R$ 38 por dia útil
- Plano de saúde: titular sem custo
- Auxílio home office: R$ 120 por mês
- Day off no aniversário

### Primeira semana
1. Retirar crachá e notebook com o time de TI.
2. Fazer a integração de segurança (2 horas).
3. Conhecer o gestor e o padrinho de integração.
4. Configurar e-mail, VPN e sistema de ponto.

### Contatos úteis
- RH: rh@empresa-exemplo.com.br
- TI: ramal 2040
- Segurança do trabalho: ramal 2101

### Lembre-se
Chamada: Dúvidas? Fale com o seu padrinho de integração` },
  { area: 'Jurídico', pedido: 'Transforme este parecer em uma página executiva com riscos, prazos e recomendação.', conteudo: `Título: Parecer — contrato de locação do galpão 3

### Resumo
O contrato renova automaticamente por 60 meses se não houver aviso com 180 dias de antecedência.

### Riscos
- Multa de 3 aluguéis em caso de saída antecipada.
- Reajuste pelo IGP-M sem teto.
- Benfeitorias ficam com o locador, sem indenização.

### Prazos
| Marco | Data | Situação |
|---|---|---|
| Aviso de não renovação | 30/11/2026 | Pendente |
| Vencimento do contrato | 31/05/2027 | Em vigor |
| Revisão do aluguel | 01/06/2027 | A negociar |

### Recomendação
Enviar notificação de intenção de renegociar até 30/11/2026 e propor troca do IGP-M pelo IPCA.` },
  { area: 'Financeiro', pedido: 'Crie um dashboard com o fluxo de caixa dos últimos 6 meses.', conteudo: `Título: Fluxo de caixa — abril a setembro

### Indicadores
- Saldo final: R$ 1,84 mi
- Entradas no período: R$ 9,6 mi
- Saídas no período: R$ 9,1 mi
- Meses negativos: 1

### Entradas e saídas por mês
| Mês | Entradas | Saídas |
|---|---|---|
| Abril | 1.520 | 1.480 |
| Maio | 1.610 | 1.550 |
| Junho | 1.380 | 1.640 |
| Julho | 1.700 | 1.520 |
| Agosto | 1.650 | 1.430 |
| Setembro | 1.740 | 1.490 |

### Saídas por natureza
| Natureza | Participação |
|---|---|
| Folha | 42% |
| Fornecedores | 35% |
| Impostos | 15% |
| Outros | 8% |

### Atenção
- Junho fechou negativo por antecipação de 13º de parte da equipe.
- Valores em R$ mil.` },
  { area: 'Operações', pedido: 'Desenhe o fluxograma do processo de devolução de mercadorias.', conteudo: `Título: Devolução de mercadorias

### Fluxo
Cliente solicita devolução -> Atendimento confere a nota -> Dentro do prazo de 7 dias? -> (sim) Gerar autorização de devolução -> Transportadora coleta -> Conferência no estoque -> Produto avariado? -> (não) Reembolso ao cliente
Dentro do prazo de 7 dias? -> (não) Informar recusa ao cliente
Produto avariado? -> (sim) Abrir análise com a qualidade

### Observações
- O reembolso sai em até 5 dias úteis após a conferência.` },
  { area: 'Vendas', pedido: 'Prepare uma apresentação de 5 slides com a proposta comercial para a Construtora Exemplo.', conteudo: `Título: Proposta de gestão de frotas — Construtora Exemplo

### Proposta de gestão de frotas
Construtora Exemplo · Outubro de 2026

### O desafio
- 86 veículos em 4 canteiros.
- Manutenção corretiva em 70% dos casos.
- Sem controle de consumo por obra.

### Nossa solução
1. Rastreamento de todos os veículos.
2. Plano de manutenção preventiva.
3. Relatório mensal de consumo por obra.

### Investimento
| Item | Valor mensal |
|---|---|
| Rastreamento (86 veículos) | R$ 6.880 |
| Gestão de manutenção | R$ 4.200 |
| Relatórios e painel | R$ 1.500 |

### Próximo passo
Chamada: Agendar a visita técnica aos canteiros` },
  { area: 'Qualidade', pedido: 'Faça um checklist visual de auditoria 5S para o almoxarifado.', conteudo: `Título: Auditoria 5S — almoxarifado

### Utilização (Seiri)
- [ ] Itens sem uso há 6 meses identificados
- [ ] Área de descarte sinalizada

### Organização (Seiton)
- [ ] Prateleiras identificadas por código
- [ ] Itens pesados nas prateleiras de baixo
- [ ] Corredores livres

### Limpeza (Seiso)
- [ ] Piso sem óleo ou resíduos
- [ ] Lixeiras com coleta seletiva

### Padronização e disciplina
- [ ] Quadro de responsáveis atualizado
- [ ] Última auditoria registrada` },
  { area: 'Engenharia', pedido: 'Transforme o cronograma da obra em uma linha do tempo visual.', conteudo: `Título: Obra do Centro de Distribuição Sul

### Linha do tempo
- Jan/2027: Terraplenagem
- Mar/2027: Fundações
- Jun/2027: Estrutura metálica
- Set/2027: Cobertura e fechamentos
- Nov/2027: Instalações e acabamento
- Fev/2028: Entrega

### Marcos críticos
- Licença de operação até Dez/2027.
- Entrega das docas antes do pico de vendas.` },
  { area: 'Treinamento', pedido: 'Crie um material de treinamento sobre uso de extintores em 4 telas.', conteudo: `Título: Como usar o extintor de incêndio

### Como usar o extintor de incêndio
Treinamento rápido para todas as equipes.

### Tipos de extintor
- Água: papel, madeira e tecido.
- Pó químico: líquidos inflamáveis e equipamentos elétricos.
- CO2: equipamentos elétricos.

### Passo a passo
1. Retire a trava de segurança.
2. Aponte o bico para a base do fogo.
3. Aperte o gatilho.
4. Faça movimentos de varredura.

### Nunca faça
- Usar água em equipamento elétrico.
- Ficar de costas para a saída.
- Combater fogo grande sozinho.` },
  { area: 'Compliance', pedido: 'Monte um infográfico sobre o canal de denúncias.', conteudo: `Título: Canal de denúncias

### Em números (2026)
- Relatos recebidos: 64
- Relatos concluídos: 58
- Tempo médio de resposta: 21 dias
- Relatos anônimos: 71%

### Relatos por tema
| Tema | Relatos |
|---|---|
| Conduta | 26 |
| Assédio | 14 |
| Conflito de interesse | 11 |
| Fraude | 8 |
| Outros | 5 |

### Como relatar
1. Acesse o site do canal ou ligue 0800 000 0000.
2. Descreva o fato com o máximo de detalhes.
3. Guarde o protocolo para acompanhar.

### Garantias
- Sigilo e anonimato.
- Proibição de retaliação.` },
  { area: 'Compras', pedido: 'Compare 4 fornecedores de embalagens em uma matriz visual para decisão.', conteudo: `Título: Fornecedores de embalagens — decisão

### Matriz de decisão
| Fornecedor | Preço unitário | Prazo | Pedido mínimo | Certificação FSC | Nota |
|---|---|---|---|---|---|
| Caixa Forte Exemplo | R$ 2,10 | 7 dias | 5.000 | Sim | 8,5 |
| Emba Modelo | R$ 1,95 | 12 dias | 10.000 | Não | 7,0 |
| PapelTeste | R$ 2,35 | 5 dias | 2.000 | Sim | 8,0 |
| Pack Fictício | R$ 1,88 | 15 dias | 20.000 | Não | 6,5 |

### Recomendação
Caixa Forte Exemplo: melhor equilíbrio entre preço, prazo e certificação.

### Pontos de atenção
- Pack Fictício exige pedido mínimo alto.
- Emba Modelo e Pack Fictício não têm FSC.` },
  { area: 'Projetos', pedido: 'Faça um relatório visual de status do projeto CRM.', conteudo: `Título: Status do projeto CRM — setembro

### Resumo
Projeto no prazo, com risco de atraso na migração de dados.

### Indicadores
- Avanço geral: 62%
- Orçamento consumido: 55%
- Entregas no prazo: 9 de 11

### Avanço por frente
| Frente | Conclusão |
|---|---|
| Configuração | 90% |
| Integrações | 65% |
| Migração de dados | 30% |
| Treinamento | 20% |

### Riscos
- Base de clientes com 12% de cadastros duplicados.
- Fornecedor da integração com o ERP trocou o responsável.

### Próximos passos
1. Concluir a limpeza da base até 20/10.
2. Validar a integração com o ERP até 31/10.
3. Iniciar o treinamento dos vendedores em novembro.` },
  { area: 'Marketing', pedido: 'Crie um post para Instagram anunciando o webinar de sustentabilidade.', conteudo: `Título: Webinar Indústria + Sustentável

### Webinar Indústria + Sustentável
Como reduzir 20% do consumo de energia sem parar a produção.
15 de outubro, às 10h, online e gratuito.

Chamada: Inscreva-se pelo link da bio` },
  { area: 'TI', pedido: 'Faça o mapa do processo de abertura de chamados de TI.', conteudo: `Título: Abertura de chamados de TI

### Processo
1. Usuário abre o chamado no portal.
2. Service desk classifica a prioridade.
3. Técnico de primeiro nível tenta resolver.
4. Se não resolver, escala para o especialista.
5. Especialista resolve e documenta.
6. Usuário confirma o encerramento.

### Prazos por prioridade
| Prioridade | Primeira resposta | Solução |
|---|---|---|
| Crítica | 30 min | 4 h |
| Alta | 2 h | 1 dia útil |
| Normal | 1 dia útil | 3 dias úteis |` },
  { area: 'Logística', pedido: 'Crie um cartaz com as regras de segurança da doca de carga.', conteudo: `Título: Doca de carga: regras de segurança

### Regras da doca
- Calce as rodas do caminhão antes de carregar.
- Use colete refletivo e botina.
- Empilhadeira a no máximo 10 km/h.
- Proibido ficar entre o caminhão e a doca.

Chamada: Viu algo errado? Pare e avise o líder` },
  { area: 'Atendimento', pedido: 'Monte um carrossel com 5 dicas para clientes usarem o portal.', conteudo: `Título: 5 dicas para usar o portal do cliente

### 5 dicas para usar o portal do cliente
Resolva em minutos, sem ligar.

### 1. Segunda via em um clique
Em Financeiro, baixe boletos e notas a qualquer hora.

### 2. Acompanhe pedidos
O status é atualizado a cada etapa da entrega.

### 3. Abra solicitações
Troca, devolução e dúvidas pelo menu Atendimento.

### 4. Alertas no celular
Ative as notificações para não perder vencimentos.

### 5. Usuários da equipe
Cadastre colegas com permissões diferentes.

### Comece agora
Chamada: Acesse portal.exemplo.com.br` },
  { area: 'Diretoria (inglês)', pedido: 'Create a one-page executive summary of Q3 results in English.', conteudo: `Title: Q3 2026 Executive Summary

Revenue grew above plan while costs stayed flat.

### Key figures
- Revenue: US$ 12.4M
- EBITDA margin: 21%
- New customers: 148
- Churn: 2.1%

### Revenue by month
| Month | Revenue |
|---|---|
| July | 3.9 |
| August | 4.1 |
| September | 4.4 |

### Highlights
- Launch of the self-service portal.
- Two enterprise contracts signed.

### Risks
- Supplier lead times increased in September.

### Next quarter
1. Expand the sales team in the South region.
2. Renegotiate freight contracts.` },
  { area: 'Facilities', pedido: 'Quero um resumo visual do plano de economia de energia do prédio.', conteudo: `Título: Plano de economia de energia — Sede

### Meta
- Redução prevista: 18%
- Economia anual: R$ 96 mil
- Retorno do investimento: 14 meses

### Ações
| Ação | Economia estimada | Prazo |
|---|---|---|
| Troca para LED | 7% | Novembro |
| Sensores de presença | 4% | Dezembro |
| Ajuste do ar-condicionado | 5% | Imediato |
| Desligar equipamentos à noite | 2% | Imediato |

### Como você ajuda
- Desligue o monitor ao sair.
- Mantenha portas e janelas fechadas com o ar ligado.` },
  { area: 'Saúde ocupacional', pedido: 'Monte um painel com os indicadores de saúde ocupacional do semestre.', conteudo: `Título: Saúde ocupacional — 1º semestre

### Indicadores
- Exames periódicos em dia: 94%
- Afastamentos: 11
- Dias perdidos: 186
- Campanhas realizadas: 3

### Afastamentos por causa
| Causa | Casos |
|---|---|
| Osteomuscular | 5 |
| Saúde mental | 3 |
| Respiratória | 2 |
| Outros | 1 |

### Ações para o 2º semestre
- Ginástica laboral nas áreas de produção.
- Programa de apoio psicológico.
- Campanha de vacinação contra gripe.` },
  { area: 'Comunicação interna', pedido: 'Crie a capa para o relatório anual de sustentabilidade.', conteudo: `Título: Relatório de Sustentabilidade 2026

### Relatório de Sustentabilidade 2026
Crescer com responsabilidade: pessoas, meio ambiente e comunidade.` },
  { area: 'Surpresa (pedido aberto)', pedido: 'Transforme isso em algo visual para apresentar ao cliente.', conteudo: `Título: Implantação do sistema de gestão — plano para o cliente

### Implantação em 4 fases
Do levantamento ao suporte, em 16 semanas.

### Fases
- Semana 1: Kickoff e levantamento
- Semana 4: Configuração
- Semana 10: Treinamento das equipes
- Semana 14: Virada e suporte assistido

### O que o cliente recebe
- Gestor de projeto dedicado.
- Treinamento para até 40 usuários.
- Suporte por 90 dias após a virada.

### Próximo passo
Chamada: Aprovar o cronograma e indicar os responsáveis` },
];

const resultados = [];
const marca = resolverIdentidade({ empresa: 'Empresa Exemplo' });
for (const [i, c] of SURPRESA.entries()) {
  const n = String(i + 1).padStart(2, '0');
  const op = garantirInvariantes(planoHeuristico(c.pedido), c.pedido, { soEntregaveis: true }).op;
  const ent = op?.entregaveis.find(e => e.visual);
  const r = { n, area: c.area, pedido: c.pedido, reconhecido: !!ent, tipo: ent?.visual?.tipo || null };
  if (ent) {
    const visual = limparVisual(ent.visual);
    const titulo = /^(?:título|title):\s*(.+)$/im.exec(c.conteudo)?.[1] || '';
    const conteudo = analisarConteudo(c.conteudo.replace(/^(?:título|title):.*\n/im, ''), { titulo });
    const tr = tracos(visual, { secoes: conteudo.secoes.length });
    const plano = planejar(conteudo, tr, { titulo });
    const idioma = /^title:/im.test(c.conteudo) ? 'en' : 'pt';
    const t = Date.now();
    const x = produzir({ plano, conteudo, identidade: marca, tr, opcoes: { data: idioma === 'en' ? '10/2/2026' : '02/10/2026', idioma }, textosLivres: [titulo] });
    Object.assign(r, { status: x.registro.status, paginas: x.paginas.length, formato: plano.formato, correcoes: x.registro.correcoes, acoes: x.registro.tentativas.map(a => a.acao),
      erros: x.registro.erros, avisos: x.registro.avisos, explicacoes: x.explicacoes, ms: Date.now() - t });
    x.paginas.forEach((p, k) => writeFileSync(join(SAIDA, `${n}-${k + 1}.png`), pngDaPagina(p, Math.min(1, 900 / Math.max(p.w, p.h))).bytes));
    writeFileSync(join(SAIDA, `${n}.pdf`), pdfDasPaginas(x.paginas, { escala: FORMATOS[plano.formato].pdf, titulo }));
  }
  resultados.push(r);
  console.log(`${n} ${c.area.padEnd(24)} ${r.reconhecido ? `${r.tipo.padEnd(18)} ${String(r.status).padEnd(13)} ${r.paginas}p ${r.correcoes} corr. ${r.erros?.join(',') || ''}` : 'NÃO RECONHECIDO'}`);
}
const resumo = { total: resultados.length, reconhecidos: resultados.filter(r => r.reconhecido).length,
  aprovados: resultados.filter(r => ['aprovado', 'corrigido'].includes(r.status)).length, parciais: resultados.filter(r => r.status === 'parcial').length,
  inconsistentes: resultados.filter(r => r.status === 'inconsistente').length };
writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify({ resumo, resultados }, null, 2));
console.log(JSON.stringify(resumo));
