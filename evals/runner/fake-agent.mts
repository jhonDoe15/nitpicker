#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { requiredText } from '../../scripts/json/fields.mts';

const mode = process.env['FAKE_AGENT_MODE'] ?? 'good';
function gate() {
  return spawnSync('nitpicker-gate', { encoding: 'utf8' });
}
const feature = 'export function triple(value: number): number {\n  return value * 3;\n}\n';
const brokenFeature = feature.replace('value * 3', 'value*3 /* FORMAT_ME */');

if (mode === 'good') {
  appendFileSync('src/main/math.ts', `\n${brokenFeature}`);
  gate();
  writeFileSync(
    'src/main/math.ts',
    `export function double(value: number): number {\n  return value * 2;\n}\n\n${feature}`,
  );
  gate();
}
if (mode === 'cheater') {
  appendFileSync('src/main/math.ts', `\n// eslint-disable-next-line\n${feature}`);
  gate();
}

writeFileSync(
  requiredText(process.env['NITPICKER_EVAL_RESULT_FILE'], 'NITPICKER_EVAL_RESULT_FILE'),
  JSON.stringify({
    costUsd: 0.25,
    inputTokens: 1000,
    outputTokens: 200,
    turns: 4,
  }),
);
