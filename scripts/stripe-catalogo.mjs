import { prepararCatalogoStripe } from '../src/plataforma/stripe-catalogo.js';

const args = process.argv.slice(2);
try {
  if (args.some(a => a !== '--aplicar-teste' && !/^--moeda=(usd|brl|todas)$/.test(a))
    || args.filter(a => a.startsWith('--moeda=')).length > 1) throw new Error('Uso: node scripts/stripe-catalogo.mjs [--aplicar-teste] [--moeda=usd|brl|todas]');
  const r = await prepararCatalogoStripe(process.env, { aplicar: args.includes('--aplicar-teste'),
    moeda: args.find(a => a.startsWith('--moeda='))?.split('=')[1] || 'todas' });
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
} catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1; }
