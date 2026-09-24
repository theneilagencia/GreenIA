// Registro dos blocos de capacidade: nome no pipeline → implementação.
import type { BlockName, PipelineStep } from './params.ts';
import type { Block, RunContext, Section } from './types.ts';
import { lerBlock } from './ler.ts';
import { extrairBlock } from './extrair.ts';
import { conferirBlock } from './conferir.ts';
import { checklistBlock } from './checklist.ts';
import { classificarBlock } from './classificar.ts';
import { consultarBlock, buscarBlock, resumirBlock } from './consultar.ts';
import { exportarBlock } from './exportar.ts';

export const BLOCKS: Record<BlockName, Block> = {
  ler: lerBlock,
  extrair: extrairBlock,
  conferir: conferirBlock,
  checklist: checklistBlock,
  classificar: classificarBlock,
  consultar: consultarBlock,
  buscar: buscarBlock,
  resumir: resumirBlock,
  exportar: exportarBlock,
};

export function runBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  return BLOCKS[step.bloco](ctx, step);
}
