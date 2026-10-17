// Homologação: inclui o usuário comum de teste e desativa (sem excluir) cadastros digitados errado.
// Uso: rodar homolog-ajustar-pessoas <email do usuário comum> [emails a desativar separados por vírgula]
export default async function (c, incluir, desativar = '') {
  const lista = async () => { const r = await c.api('GET', '/api/empresa/usuarios'); return r.dados?.usuarios || r.dados?.pessoas || r.dados || []; };
  if (incluir && !(await lista()).some(u => u.email === incluir)) {
    const r = await c.api('POST', '/api/empresa/usuarios', { email: incluir, name: 'Usuário Homolog', role_id: 'role_member' });
    c.log('incluir', r.status, JSON.stringify(r.dados).slice(0, 200));
  }
  for (const e of desativar.split(',').filter(Boolean)) {
    const u = (await lista()).find(x => x.email === e);
    if (!u) { c.log('desativar', e, 'não encontrado'); continue; }
    const r = await c.api('PUT', `/api/empresa/usuarios/${u.id || u.user_id}`, { status: 'inativo' });
    c.log('desativar', e, r.status, JSON.stringify(r.dados).slice(0, 160));
  }
  c.log('final', JSON.stringify((await lista()).map(u => [u.email, u.role_key, u.status])));
}
