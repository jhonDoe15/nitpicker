import { existsSync, readFileSync } from 'node:fs';

const FIELDS = ['costUsd', 'inputTokens', 'outputTokens', 'totalTokens', 'turns', 'durationMs'];
const isFigure = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Reads the figures an agent (or the orchestrator driving it) wrote to NITPICKER_EVAL_RESULT_FILE:
 * `{ costUsd?, inputTokens?, outputTokens?, totalTokens?, turns?, durationMs? }`. Every field is
 * optional and must be a non-negative number; any other value is dropped, as if it were missing.
 * Without `totalTokens`, it is the sum of input and output tokens when both are given. A missing
 * or unreadable file gives `{}`.
 */
export function readAgentResult(file) {
  if (!existsSync(file)) return {};
  try {
    const written = JSON.parse(readFileSync(file, 'utf8'));
    const figures = Object.fromEntries(
      FIELDS.filter((field) => isFigure(written[field])).map((field) => [field, written[field]]),
    );
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
