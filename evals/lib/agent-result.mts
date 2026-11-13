import { existsSync, readFileSync } from 'node:fs';
import { fieldsOf } from '../../scripts/json/fields.mts';

const FIELDS = [
  'costUsd',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'turns',
  'durationMs',
] as const;

export type AgentFigures = Partial<Record<(typeof FIELDS)[number], number>>;

function isFigure(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function readAgentResult(file: string): AgentFigures {
  if (!existsSync(file)) return {};
  try {
    const written = fieldsOf(JSON.parse(readFileSync(file, 'utf8')));
    const figures: AgentFigures = {};
    for (const field of FIELDS) {
      const figure = written?.[field];
      if (isFigure(figure)) figures[field] = figure;
    }
    const { inputTokens, outputTokens } = figures;
    if (
      figures.totalTokens === undefined &&
      inputTokens !== undefined &&
      outputTokens !== undefined
    ) {
      figures.totalTokens = inputTokens + outputTokens;
    }
    return figures;
  } catch {
    return {};
  }
}
