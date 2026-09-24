// Configuração de um tenant: marca, textos, política de dados, modelo, limites e
// retenção. Tudo que no protótipo era "do Grupo" vem daqui. Validada por Zod no
// cadastro; o tema (cores de texto que passam de 4,5:1) é derivado na hora.
import { z } from 'zod';
import { readerById } from '../readers/registry.ts';
import core from '../../../lib/greenia-core.js';
import { contrast, textVariant, MIN_NORMAL, normalizeHex } from '../../../lib/contrast.mjs';
import type { DataAction } from '../../../lib/greenia-core.js';
import { checkPolicyAgainstClasses } from '../policy/data-policy.ts';
import { BUILTIN_TYPES, detectorsSchema, TYPE_KEY } from '../policy/detectors.ts';

const hex = z.string().regex(/^#?[0-9a-fA-F]{6}$/, 'cor em hexadecimal, ex.: #1F8A5B').transform(v => normalizeHex(v));

const ACTIONS = core.DATA_ACTIONS as [DataAction, ...DataAction[]];

// Ação por tipo de dado: tipos de fábrica e os que o tenant cadastrar (detectors).
export const dataPolicySchema = z.record(z.string().regex(TYPE_KEY), z.enum(ACTIONS));

export const tenantConfigSchema = z.object({
  branding: z.object({
    productName: z.string().min(1).max(40).default('GreenIA'),
    orgName: z.string().min(1).max(80).default('Grupo'),
    logoUrl: z.string().max(500).optional(),
    colors: z.object({
      primary: hex.default('#1F8A5B'),     // botões, links, destaques
      onPrimary: hex.default('#FAF7EF'),   // texto sobre o primário
      deep: hex.default('#0F3A2A'),        // sidebar, login
      accent: hex.default('#B9E85A'),      // destaque sobre o fundo escuro
      background: hex.default('#FAF7EF'),  // fundo principal
      surface: hex.default('#FBF9F2'),     // superfícies claras
      sand: hex.default('#F1EAD9'),        // fundo de seção
      mint: hex.default('#E6F0E7'),        // fundo de chips
      line: hex.default('#E9E0CD'),        // bordas
      ink: hex.default('#16241D'),         // texto principal
      muted: hex.default('#66645A'),       // texto secundário
    }).prefault({}),
  }).prefault({}),
  texts: z.object({
    tagline: z.string().max(120).default('A IA do dia a dia do Grupo'),
    heroTitle: z.string().max(120).default('IA para todos, com segurança.'),
    heroSubtitle: z.string().max(300).default('Simples e segura. Entre com seu login do Grupo e use para o que aparece no dia: resumir, rascunhar, organizar.'),
    whatIs: z.string().max(600).default('A GreenIA é a IA do dia a dia do Grupo. Qualquer pessoa entra com o login corporativo, sem licença. Serve para tarefas leves: resumir textos, rascunhar emails, organizar anotações. É o convite para usar IA do jeito certo.'),
  }).prefault({}),
  policyUrl: z.string().max(500).default('Política%20GreenIA.dc.html'),
  privacyNote: z.string().max(400).default('Suas conversas ficam só nesta sessão. A GreenIA não guarda o histórico em banco de dados.'),
  privacyDetail: z.string().max(1500).default(''),
  keyUserContact: z.string().max(200).default(''),
  dataPolicy: dataPolicySchema.default({ ...core.DATA_POLICY }),
  // Detectores próprios do tenant (padrão, validação, classe, ação padrão).
  detectors: detectorsSchema,
  // Leitores especializados ligados (src/readers/: ex. 'nfe', 'danfe'). Padrão: nenhum.
  readers: z.array(z.string().max(40)).max(50).default([]).refine(ids => ids.every(id => !!readerById(id)), { message: 'leitor desconhecido' }),
  // Provedor do modelo. Hoje só a API da Anthropic: o Claude no Amazon Bedrock
  // não tem opção de processamento no Brasil (ver RELATORIO-FASE-2.md). O
  // padrão é o modelo mais leve, coerente com a política ("roda no modelo mais leve").
  llm: z.object({
    provider: z.enum(['anthropic']).default('anthropic'),
    model: z.string().min(1).max(120).default('claude-haiku-4-5'),
    maxOutputTokens: z.number().int().min(256).max(16000).default(4096),
  }).prefault({}),
  limits: z.object({
    maxMessageChars: z.number().int().min(100).max(200000).default(20000),
    maxFileMb: z.number().int().min(1).max(200).default(20),
    userPerMinute: z.number().int().min(1).max(600).default(20),
    tenantPerMinute: z.number().int().min(1).max(20000).default(600),
    monthlyBudgetBrl: z.number().min(0).default(500),
    hardLimit: z.boolean().default(true),
  }).prefault({}),
  retention: z.object({
    defaultOutputDays: z.number().int().min(1).max(3650).default(90),
  }).prefault({}),
  autoProvision: z.boolean().default(true), // cria o usuário no primeiro login, se o domínio for permitido
}).superRefine((c, ctx) => {
  // O chat livre (sem assistente) é o ambiente Verde: a política do tenant vale ali.
  for (const p of checkPolicyAgainstClasses(c.dataPolicy, ['verde'], c.detectors)) {
    ctx.addIssue({ code: 'custom', path: ['dataPolicy', p.type], message: `${p.action}: ${p.reason}` });
  }
  for (const k of Object.keys(c.dataPolicy)) {
    if (!BUILTIN_TYPES.includes(k) && !c.detectors.some(d => d.key === k)) ctx.addIssue({ code: 'custom', path: ['dataPolicy', k], message: 'tipo de dado desconhecido: cadastre o detector antes' });
  }
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export interface Theme {
  tokens: Record<string, string>;
  adjustments: string[]; // cores trocadas por variante, para o relatório de cadastro
}

// Deriva as cores de texto que passam de 4,5:1 sobre os fundos claros do tema e o
// fundo de botão que dá 4,5:1 com o texto sobre o primário. Mesma lógica do 1B.4.
export function deriveTheme(colors: TenantConfig['branding']['colors']): Theme {
  const light = [colors.background, colors.surface, colors.sand, colors.mint, colors.line, '#FFFFFF'];
  const adjustments: string[] = [];
  const primaryText = textVariant(colors.primary, light);
  if (primaryText !== colors.primary) adjustments.push(`primário para texto: ${colors.primary} → ${primaryText} (${contrast(primaryText, colors.line).toFixed(2)}:1 no pior fundo)`);
  let primaryStrong = colors.primary;
  if (contrast(colors.onPrimary, colors.primary) < MIN_NORMAL) {
    primaryStrong = textVariant(colors.primary, [colors.onPrimary]);
    adjustments.push(`fundo de botão: ${colors.primary} → ${primaryStrong} (${contrast(colors.onPrimary, primaryStrong).toFixed(2)}:1 com o texto)`);
  }
  const muted = textVariant(colors.muted, light);
  if (muted !== colors.muted) adjustments.push(`texto secundário: ${colors.muted} → ${muted}`);
  const ink = textVariant(colors.ink, light);
  if (ink !== colors.ink) adjustments.push(`texto principal: ${colors.ink} → ${ink}`);
  const accentOnDeep = textVariant(colors.accent, [colors.deep]);
  if (accentOnDeep !== colors.accent) adjustments.push(`destaque sobre fundo escuro: ${colors.accent} → ${accentOnDeep}`);
  return {
    adjustments,
    tokens: {
      '--gia-forest': colors.primary,
      '--gia-forest-text': primaryText,
      '--gia-forest-strong': primaryStrong,
      '--gia-paper': colors.background,
      '--gia-surface': colors.surface,
      '--gia-sand': colors.sand,
      '--gia-mint': colors.mint,
      '--gia-line': colors.line,
      '--gia-ink': ink,
      '--gia-muted': muted,
      '--gia-deep': colors.deep,
      '--gia-spark': accentOnDeep,
    },
  };
}

export function parseTenantConfig(input: unknown): { config: TenantConfig; theme: Theme } {
  const config = tenantConfigSchema.parse(input ?? {});
  return { config, theme: deriveTheme(config.branding.colors) };
}

// O que qualquer visitante pode ver (antes do login): nada de segredo nem de
// configuração interna de provedores.
export function publicConfig(t: { slug: string; name: string; config: unknown; providers: unknown }) {
  const { config, theme } = parseTenantConfig(t.config);
  return {
    tenant: { slug: t.slug, name: t.name },
    branding: { productName: config.branding.productName, orgName: config.branding.orgName, logoUrl: config.branding.logoUrl ?? null },
    theme: theme.tokens,
    texts: config.texts,
    policyUrl: config.policyUrl,
    privacyNote: config.privacyNote,
    privacyDetail: config.privacyDetail,
    keyUserContact: config.keyUserContact,
    dataPolicy: config.dataPolicy, // para o aviso antecipado no navegador; a decisão é do servidor
    limits: { maxMessageChars: config.limits.maxMessageChars, maxFileMb: config.limits.maxFileMb },
    providers: t.providers,
  };
}
