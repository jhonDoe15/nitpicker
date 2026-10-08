#!/usr/bin/env node
// A scripted stand-in for a real agent, used to test the runner without calling a paid API. It
// shows the contract a real agent command follows: work in the current directory, run the gate
// with `nitpicker-gate`, and write cost figures to NITPICKER_EVAL_RESULT_FILE.
//
// FAKE_AGENT_MODE: "good" (default) writes the feature, gets one gate failure, fixes it and
// re-runs the gate; "lazy" changes nothing; "cheater" passes the gate by suppressing it.
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const mode = process.env.FAKE_AGENT_MODE ?? 'good';
const gate = () => spawnSync('nitpicker-gate', { encoding: 'utf8' });
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
  process.env.NITPICKER_EVAL_RESULT_FILE,
  JSON.stringify({
    costUsd: 0.25,
    inputTokens: 1000,
    outputTokens: 200,
    turns: 4,
  }),
);
