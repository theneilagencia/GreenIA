// Bloqueios que exigem decisão de governança (nenhum modelo autorizado para dado sigiloso, nenhum modelo
// liberado, chave de IA recusada...): quem usa recebe uma mensagem simples e orientada à tarefa; os admins
// da empresa e a operadora da plataforma recebem o aviso técnico, no máximo uma vez por dia por causa.
import { todos } from './db.js';
import { registrar } from './eventos.js';
import { enviarParaTodos } from './plano.js';

// Mensagens para quem usa: sem modelo, classe, homologação, janela, provedor ou configuração.
export const MSG_USUARIO = {
  sigilo: 'Não foi possível processar esta solicitação com segurança. Os recursos de IA desta empresa ainda não estão autorizados a receber este tipo de informação. Nenhum conteúdo foi enviado. O administrador foi informado.',
  indisponivel: 'Não foi possível processar esta solicitação agora. Nenhum conteúdo foi enviado. O administrador foi informado.',
  grande: 'Este conteúdo é grande demais para ser analisado de uma vez. Envie uma parte do material por vez (por exemplo, um arquivo ou um capítulo de cada vez).',
  ia_fora: 'A IA está temporariamente indisponível. A equipe responsável já foi avisada. Tente de novo mais tarde.',
  falhou: 'A IA não conseguiu responder agora. Tente de novo em instantes.',
};

// O que o admin precisa saber e fazer (linguagem de governança, fica fora do fluxo de quem usa).
const PARA_ADMIN = {
  sem_modelo_sigilo: ['Pedido com informação sigilosa bloqueado', 'Uma pessoa tentou enviar uma mensagem com informação sigilosa, e nenhum recurso de IA autorizado para esse tipo de informação estava disponível para ela. Nada foi enviado.\n\nO que resolve: em Gestão → Modelos, escolha "Seguir recomendações da GreenIA" (vale a autorização da equipe da plataforma, quando houver) ou autorize um modelo para dados sigilosos. Se já houver um autorizado, confira se ele está disponível para o grupo ou a área da pessoa.'],
  sem_modelo: ['Pedido bloqueado: nenhum modelo disponível', 'Uma pessoa tentou usar a IA e nenhum recurso liberado atendia às regras da empresa. Nada foi enviado.\n\nO que resolve: em Gestão → Modelos, escolha "Seguir recomendações da GreenIA", que deixa um recurso pronto em cada nível.'],
  quick_win_sem_modelo: ['Quick win com nível indisponível', 'Um quick win foi usado, mas o nível definido para ele não está disponível para quem usou. A GreenIA atendeu no modo automático, dentro das mesmas regras.\n\nO que resolve: no quick win, escolha um nível disponível para a equipe, ou em Gestão → Modelos escolha "Seguir recomendações da GreenIA".'],
  ia_fora: ['A IA não respondeu a um pedido', 'Uma resposta falhou porque o serviço de IA recusou o acesso ou está sem créditos. Quem usa recebeu só a mensagem de indisponibilidade.\n\nO que resolve: a equipe da plataforma também foi avisada e cuida disso; a empresa não precisa configurar nada. Em instalação própria, sem a equipe da plataforma, confira o acesso ao serviço de IA no servidor.'],
  plano_reserva: ['Créditos no fim sem recurso econômico disponível', 'Os créditos do mês acabaram e não há recurso do nível Rápido disponível para continuar atendendo. Nada foi enviado.\n\nO que resolve: em Gestão → Modelos, escolha "Seguir recomendações da GreenIA", ou contrate um pacote adicional de créditos.'],
};
// Resumo para o painel do admin: o que aconteceu e o que resolve, sem jargão.
export const resumoAlerta = causa => { const [assunto, texto] = PARA_ADMIN[causa] || [`Pedido bloqueado (${causa})`, 'Uma solicitação foi bloqueada pelas regras da empresa. Nada foi enviado.']; const [oque, resolve = ''] = texto.split('\n\n'); return { assunto, oque, resolve }; };

export async function avisarGovernanca(app, causa, detalhes = {}) {
  const [assunto, texto] = PARA_ADMIN[causa] || [`Pedido bloqueado (${causa})`, 'Uma solicitação foi bloqueada pelas regras da empresa. Nada foi enviado.'];
  const desde = new Date(app.agora().getTime() - 864e5).toISOString();
  const recente = todos(app.db, "select detalhes from eventos where tipo = 'governance.admin_alert' and em >= ?", desde).some(e => { try { return JSON.parse(e.detalhes).causa === causa; } catch { return false; } });
  registrar(app, 'governance.blocked', detalhes.pessoa ?? null, { causa, conversa: detalhes.conversa ?? null });
  if (recente) return false;
  registrar(app, 'governance.admin_alert', null, { causa });
  await enviarParaTodos(app, assunto, texto).catch(e => app.log?.('aviso de governança', e.message));
  return true;
}
