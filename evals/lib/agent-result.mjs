import { existsSync, readFileSync } from 'node:fs';

const isCount = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Reads the figures an agent (or the orchestrator driving it) wrote to NITPICKER_EVAL_RESULT_FILE:
 * `{ costUsd?, inputTokens?, outputTokens?, totalTokens?, turns?, durationMs? }`. Every field is
 * optional. Without `totalTokens`, it is the sum of input and output tokens when both are given.
 * A missing or unreadable file gives `{}`.
 */
export function readAgentResult(file) {
  if (!existsSync(file)) return {};
  try {
    const written = JSON.parse(readFileSync(file, 'utf8'));
    const { costUsd, inputTokens, outputTokens, turns, durationMs } = written;
    const counted = isCount(inputTokens) && isCount(outputTokens);
    const totalTokens = written.totalTokens ?? (counted ? inputTokens + outputTokens : undefined);
    return { costUsd, inputTokens, outputTokens, totalTokens, turns, durationMs };
  } catch {
    return {};
  }
}
