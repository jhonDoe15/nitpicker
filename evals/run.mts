#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fieldAt, requiredFields, requiredText } from '../scripts/json/fields.mts';
import { packNitpicker } from './lib/consumer.mts';
import { appendRecordAsSingleWrite, readRecords } from './lib/results.mts';
import { aggregate, renderMarkdown } from './runner/report.mts';
import { installedWorkdir } from './lib/workdirs.mts';
import { runCase } from './runner/run-case.mts';
import { type CaseDefinition, isStale, listCases } from './case-definition/case-definition.mts';

const USAGE = [
  'usage: node evals/run.mts <run|report> [options]',
  '  run --agent "<command>" --tier <name> [--model <id>] [--runs 5] [--run 1] [--case <id>]...',
  '      [--only-stale] [--results <dir>] [--cases <dir>]',
  '      --run <n> numbers the first run, so processes can run side by side without writing the',
  '      same run of a case: --run 1 --runs 2 in one and --run 3 --runs 2 in another',
  '  report [--results <dir>] [--format markdown|json]',
].join('\n');

const packageRoot = path.resolve(import.meta.dirname, '..');
const defaultResults = path.join(import.meta.dirname, 'results');

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: 'string' },
    tier: { type: 'string' },
    model: { type: 'string' },
    runs: { type: 'string', default: '5' },
    run: { type: 'string', default: '1' },
    case: { type: 'string', multiple: true },
    cases: { type: 'string', default: path.join(import.meta.dirname, 'cases') },
    'only-stale': { type: 'boolean', default: false },
    results: { type: 'string', default: defaultResults },
    format: { type: 'string', default: 'markdown' },
  },
});

function runNumbers(): number[] {
  const first = Number(values.run);
  const count = Number(values.runs);
  const whole = /^[1-9]\d*$/u;
  if (!whole.test(values.run) || !whole.test(values.runs)) {
    throw new Error('--run and --runs take whole numbers of 1 or more');
  }
  return Array.from({ length: count }, (_, index) => first + index);
}

function selectedCases(all: readonly CaseDefinition[], presetVersion: string): CaseDefinition[] {
  const unknown = (values.case ?? []).filter((id) => !all.some((entry) => entry.id === id));
  if (unknown.length > 0) {
    const known = all.map((entry) => entry.id).join(', ');
    throw new Error(`unknown --case ${unknown.join(', ')}; known cases: ${known}`);
  }
  return all
    .filter((entry) => !values.case || values.case.includes(entry.id))
    .filter((entry) => !values['only-stale'] || isStale(entry, presetVersion));
}

function printReport(): void {
  const records = readRecords(values.results);
  process.stdout.write(
    values.format === 'json'
      ? `${JSON.stringify(aggregate(records), null, 2)}\n`
      : renderMarkdown(records),
  );
}

function runCases(): void {
  if (!values.agent || !values.tier) {
    throw new Error('run needs --agent <command> and --tier <name>');
  }
  const runs = runNumbers();
  const manifest = requiredFields(
    JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')),
    'package.json',
  );
  const nitpickerVersion = requiredText(fieldAt(manifest, 'version'), 'package.json version');
  const selected = selectedCases(listCases(path.resolve(values.cases)), nitpickerVersion);
  mkdirSync(values.results, { recursive: true });
  const { tarball, cleanup } = packNitpicker(packageRoot);
  try {
    for (const caseDefinition of selected) {
      for (const runNumber of runs) {
        const record = runCase({
          caseDefinition,
          agentCommand: values.agent,
          prepareWorkdir: installedWorkdir({ tarball, manifest }),
          tier: values.tier,
          model: values.model,
          run: runNumber,
          nitpickerVersion,
        });
        appendRecordAsSingleWrite(values.results, record);
        console.log(
          `${record.caseId} run ${String(runNumber)} (${values.tier}): ${record.outcome}`,
        );
      }
    }
  } finally {
    cleanup();
  }
  writeFileSync(
    path.join(values.results, 'report.md'),
    renderMarkdown(readRecords(values.results)),
  );
}

const [commandName] = positionals;
const selectedCommand =
  commandName === 'run' ? runCases : commandName === 'report' ? printReport : undefined;
if (!selectedCommand) {
  console.error(USAGE);
  process.exit(2);
}
try {
  selectedCommand();
} catch (error) {
  console.error(`evals: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
