import { prepararCatalogoStripe } from '../src/plataforma/stripe-catalogo.js';

const args = process.argv.slice(2);
try {
  if (args.some(a => !['--aplicar-teste','--aplicar-producao'].includes(a) && !/^--moeda=(usd|brl|todas)$/.test(a))
    || args.filter(a => a.startsWith('--moeda=')).length > 1 || (args.includes('--aplicar-teste') && args.includes('--aplicar-producao'))) throw new Error('Uso: node scripts/stripe-catalogo.mjs [--aplicar-teste|--aplicar-producao] [--moeda=usd|brl|todas]');
  if (args.includes('--aplicar-producao') && process.env.STRIPE_HABILITADO !== 'producao') throw new Error('Produção exige STRIPE_HABILITADO=producao e credenciais da conta escolhida.');
  if (args.includes('--aplicar-teste') && process.env.STRIPE_HABILITADO === 'producao') throw new Error('Não use --aplicar-teste em produção.');
  const r = await prepararCatalogoStripe(process.env, { aplicar: args.includes('--aplicar-teste') || args.includes('--aplicar-producao'),
    moeda: args.find(a => a.startsWith('--moeda='))?.split('=')[1] || 'todas' });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
} catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1; }
