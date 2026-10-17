// Homologação: pessoas do tenant (email, perfil, situação) para conferir o cadastro de teste.
export default async function (c) {
  const r = await c.api('GET', '/api/empresa/usuarios');
  const lista = r.dados?.usuarios || r.dados?.pessoas || r.dados || [];
  c.log('pessoas', r.status, JSON.stringify((Array.isArray(lista) ? lista : []).map(u => [u.email, u.role_key || u.perfil || u.role_id, u.status])).slice(0, 800));
}
