// Mapeamentos de importação no banco: versão atual de cada um (para a execução)
// e criação da versão 1 (pela API ou pela implantação do tenant).
import type { Tx } from '../db/pool.ts';
import { mapeamentoConfigSchema, type MapeamentoAtivo, type MapeamentoConfig } from './schema.ts';

export const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'mapeamento';

// Versão atual de cada mapeamento ativo do tenant (para a execução).
export async function mapeamentosAtivos(tx: Tx): Promise<MapeamentoAtivo[]> {
  const rows = (await tx.query(`select m.id, m.slug, m.name, m.current_version, v.config from import_mappings m
    join import_mapping_versions v on v.mapping_id = m.id and v.version = m.current_version where m.archived_at is null order by m.slug`)).rows;
  const out: MapeamentoAtivo[] = [];
  for (const r of rows) {
    const c = mapeamentoConfigSchema.safeParse(r.config);
    if (c.success) out.push({ id: r.id, slug: r.slug, nome: r.name, versao: r.current_version, config: c.data });
  }
  return out;
}

// Cria um mapeamento (versão 1). Usado pela API e pela implantação do tenant.
export async function criarMapeamento(tx: Tx, tenantId: string, actor: string | null, m: { slug?: string; nome: string; descricao?: string; config: MapeamentoConfig; nota?: string }) {
  const slug = m.slug ?? slugify(m.nome);
  const id = (await tx.query(`insert into import_mappings (tenant_id, slug, name, description, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [tenantId, slug, m.nome, m.descricao ?? '', actor])).rows[0].id as string;
  await tx.query(`insert into import_mapping_versions (tenant_id, mapping_id, version, config, note, created_by) values ($1, $2, 1, $3, $4, $5)`,
    [tenantId, id, m.config, m.nota ?? '', actor]);
  return { id, slug, versao: 1 };
}

