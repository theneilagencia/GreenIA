// Homologação: estado do ambiente e do plano vistos pela sessão (sem dados pessoais além do perfil).
export default async function (c) {
  const eu = (await c.api('GET', '/api/eu')).dados;
  const e = eu?.plataforma?.empresa || {};
  c.log(JSON.stringify({ status: e.status, plano: e.plano || e.plan || e.plan_id || null, recursos: eu?.plataforma?.recursos, permissoes: (eu?.permissoes || []).filter(p => /chat|quick|company/.test(p)) }).slice(0, 900));
}
