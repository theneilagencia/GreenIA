// Etapa do chat: limites antes da chamada e registro do consumo depois
// (a lógica é comum às execuções de assistentes, em record.ts).
import type { ChatStep } from '../chat/hooks.ts';
import { checkLimits, recordUsage } from './record.ts';

export const usageStep: ChatStep = {
  name: 'limites-e-consumo',
  async prepare({ app, auth, config }) {
    return (await checkLimits(app, auth, config)) ?? undefined;
  },

  async completed({ app, auth, config, usage, model, providerId }, state) {
    await recordUsage(app, config, { tenantId: auth.tenantId, userId: auth.userId, assistantId: state.assistant?.id ?? null, provider: providerId, model, usage });
  },
};
