// Homologação (Etapa 5): o que o usuário comum NÃO pode fazer, e envios sob limite (status e motivo, sem conteúdo).
// Uso: rodar homolog-usuario permissoes | rodar homolog-usuario enviar <rotulo>
export default async function (c, acao = 'permissoes', rotulo = 'envio') {
  if (acao === 'permissoes') {
    const out = [];
    const t = async (k, m, p, corpo) => { const r = await c.api(m, p, corpo); out.push([k, m, p, r.status, r.dados?.erro || null]); };
    await t('admin_areas', 'GET', '/api/admin/areas');
    await t('admin_eventos', 'GET', '/api/admin/eventos');
    await t('admin_uso', 'GET', '/api/admin/uso');
    await t('admin_config_alterar', 'PUT', '/api/admin/config', { limiteDiarioPessoa: 0 });
    await t('pessoas_criar', 'POST', '/api/empresa/usuarios', { email: 'nao-deve@exemplo.com.br', role_id: 'role_member' });
    await t('documento_area_restrita', 'POST', '/api/bases/documentos', { area_id: 1, titulo: 'Tentativa', arquivo: { nome: 't.txt', base64: Buffer.from('tentativa').toString('base64') } });
    await t('documento_restrito_ler', 'GET', '/api/bases/documentos/1/conteudo');
    await t('conversa_do_admin', 'GET', '/api/conversas/1');
    await t('quick_win_editar', 'PUT', '/api/quick-wins/1', { nome: 'tentativa' });
    await t('quick_win_publicar', 'POST', '/api/quick-wins/1/publicar', {});
    await t('programar', 'POST', '/api/quick-wins/1/programacoes', { nome: 'x', tipo: 'horario', agenda: { frequencia: 'diaria', hora: '08:00', fuso: 'America/Sao_Paulo' }, entrada: 'x' });
    await t('integracoes', 'GET', '/api/admin/integracoes');
    c.salvar('homolog-usuario-permissoes', out); c.log('permissoes', JSON.stringify(out.map(x => `${x[0]}:${x[3]}`)));
    return;
  }
  const conv = c.estado.convUsuario || (c.estado.convUsuario = (await c.api('POST', '/api/conversas', {})).dados?.conversa?.id);
  const r = await c.enviar(conv, { texto: 'Responda só "ok". Teste sintético de limite.' });
  const fim = r.linhas?.find(l => l.t === 'fim'), erro = r.linhas?.find(l => l.t === 'erro');
  const out = { rotulo, status: r.status, erro: r.erro ? (() => { try { return JSON.parse(r.erro).erro; } catch { return r.erro.slice(0, 80); } })() : erro?.codigo || null, respondeu: !!fim, ms: r.ms };
  c.salvar(`homolog-usuario-${rotulo}`, out); c.log('envio', JSON.stringify(out));
}
