// Curadoria de modelos textuais. Disponibilidade, preços e contexto vêm do catálogo real.
// Estas classes são uma política operacional, não notas de benchmark ou autorizações de sigilo.
export const POOLS_RECOMENDADOS = [
  { id: 'google/gemini-3.5-flash-lite', perfil: 'rapido' },
  { id: 'openai/gpt-5-mini', perfil: 'rapido' },
  { id: 'google/gemini-3.1-flash-lite', perfil: 'rapido' },
  { id: 'anthropic/claude-haiku-4.5', perfil: 'equilibrado' },
  { id: 'openai/gpt-5.4-mini', perfil: 'equilibrado' },
  { id: 'google/gemini-3.8-flash', perfil: 'equilibrado' },
  { id: 'anthropic/claude-sonnet-5', perfil: 'avancado' },
  { id: 'openai/gpt-5.5', perfil: 'avancado' },
  { id: 'google/gemini-3.5-flash', perfil: 'avancado' },
];
// Tetos para inclusão automática; custos maiores exigem uma decisão manual da empresa.
const TETOS = { rapido: [0.5, 3], equilibrado: [1.5, 10], avancado: [5, 30] };
export function confirmadoParaPool(m, perfil) {
  const [entrada, saida] = TETOS[perfil];
  return m && Number.isFinite(m.precoEntrada) && m.precoEntrada > 0 && m.precoEntrada <= entrada / 1e6
    && Number.isFinite(m.precoSaida) && m.precoSaida > 0 && m.precoSaida <= saida / 1e6
    && Number.isFinite(m.contexto) && m.contexto >= 32000;
}

// Afinidades editoriais da curadoria, usadas apenas como preferência limitada.
// Não são notas de benchmark e nunca tornam um recurso insuficiente elegível.
const AFINIDADES = {
  'google/gemini-3.5-flash-lite': ['sintese','extracao','traducao','classificacao'],
  'openai/gpt-5-mini': ['programacao','raciocinio'],
  'google/gemini-3.1-flash-lite': ['extracao','traducao','classificacao'],
  'anthropic/claude-haiku-4.5': ['redacao','sintese','traducao'],
  'openai/gpt-5.4-mini': ['programacao','raciocinio'],
  'google/gemini-3.8-flash': ['analise','extracao'],
  'anthropic/claude-sonnet-5': ['programacao','redacao'],
  'openai/gpt-5.5': ['raciocinio','analise'],
  'google/gemini-3.5-flash': ['sintese','extracao'],
};
export const afinidadeDaTarefa = (id, tipos = []) => (AFINIDADES[id] || []).some(t => tipos.includes(t)) ? 0.6 : 0;
