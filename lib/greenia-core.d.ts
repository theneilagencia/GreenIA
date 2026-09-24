// Tipos de lib/greenia-core.js, para o servidor (TypeScript) importar o mesmo
// código que roda no navegador.

export type SensitiveType =
  | 'cpf' | 'cnpj' | 'cartao' | 'bancario' | 'pix' | 'credencial' | 'rg' | 'lista'
  | 'email' | 'telefone' | 'cep' | 'endereco' | 'nome';

export type DataAction = 'bloquear' | 'avisar' | 'mascarar' | 'permitir_com_registro' | 'permitir';
export type DataPolicy = Partial<Record<SensitiveType, DataAction>>;

export interface SensitiveMatch { type: SensitiveType; start: number; end: number }
export interface Decision {
  action: DataAction;
  block: SensitiveType[];
  warn: SensitiveType[];
  mask: SensitiveType[];
  log: SensitiveType[];
  allow: SensitiveType[];
}

export interface KbDoc { title: string; text: string }

declare const core: {
  TYPEWRITER_MAX_MS: number;
  TYPEWRITER_FRAME_MS: number;
  typewriterChunk(length: number, maxMs?: number, frameMs?: number): number;
  typewriterNext(length: number, shown: number, elapsed: number, chunk: number, maxMs?: number): number;

  SENSITIVE_LABELS: Record<SensitiveType, string>;
  DATA_ACTIONS: DataAction[];
  DATA_POLICY: Record<SensitiveType, DataAction>;
  ALWAYS_BLOCKED: SensitiveType[];
  isValidCPF(value: string): boolean;
  isValidCNPJ(value: string): boolean;
  isValidLuhn(value: string): boolean;
  findSensitive(text: string): SensitiveMatch[];
  detectSensitive(text: string): SensitiveType[];
  decideAction(types: SensitiveType[], policy?: DataPolicy): Decision;
  maskSensitive(text: string, types: SensitiveType[]): string;
  describeSensitive(types: SensitiveType[]): string;

  KB_MIN_SCORE: number;
  stemPt(token: string): string;
  tokenizePt(text: string): string[];
  retrieve<T extends KbDoc>(kb: T[], query: string): T[];
  retrieveForTurn<T extends KbDoc>(kb: T[], lastUserText: string, previousUserText?: string): T[];
};
export default core;
