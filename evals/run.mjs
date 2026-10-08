#!/usr/bin/env node
// Eval runner CLI.
//   node evals/run.mjs run --agent "<command>" --tier <name> [--model <id>] [--runs 5] [--case <id>]
//        [--only-stale] [--results <dir>]
//   node evals/run.mjs report [--results <dir>] [--format markdown|json]
// Runs are never part of the normal test job: they cost money and take minutes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { packNitpicker } from './lib/consumer.mjs';
import { aggregate, renderMarkdown } from './runner/report.mjs';
import { installedWorkdir, isStale, listCases, runCase } from './runner/run-case.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..', 'typescript');
const defaultResults = path.join(import.meta.dirname, 'results');

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: 'string' },
    tier: { type: 'string' },
    model: { type: 'string' },
    runs: { type: 'string', default: '5' },
    case: { type: 'string', multiple: true },
    'only-stale': { type: 'boolean', default: false },
    results: { type: 'string', default: defaultResults },
    format: { type: 'string', default: 'markdown' },
  },
});

function readRecords(resultsDirectory) {
  const file = path.join(resultsDirectory, 'runs.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function report() {
  const records = readRecords(values.results);
  process.stdout.write(
    values.format === 'json'
      ? `${JSON.stringify(aggregate(records), null, 2)}\n`
      : renderMarkdown(records),
  );
}

function run() {
  if (!values.agent || !values.tier) {
    throw new Error('run needs --agent <command> and --tier <name>');
  }
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const selected = listCases(path.join(import.meta.dirname, 'cases'))
    .filter((entry) => !values.case || values.case.includes(entry.id))
    .filter((entry) => !values['only-stale'] || isStale(entry, manifest.version));
  mkdirSync(values.results, { recursive: true });
  const { tarball, cleanup } = packNitpicker(packageRoot);
  try {
    for (const caseDefinition of selected) {
      for (let run = 1; run <= Number(values.runs); run += 1) {
        const record = runCase({
          caseDefinition,
          agentCommand: values.agent,
          prepareWorkdir: installedWorkdir({ tarball, manifest }),
          tier: values.tier,
          model: values.model,
          run,
          nitpickerVersion: manifest.version,
        });
        appendFileSync(path.join(values.results, 'runs.jsonl'), `${JSON.stringify(record)}\n`);
        console.log(`${record.caseId} run ${run} (${values.tier}): ${record.outcome}`);
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

const commands = { run, report };
const selectedCommand = commands[positionals[0]];
if (!selectedCommand) {
  console.error('usage: node evals/run.mjs <run|report> [options]');
  process.exit(2);
}
selectedCommand();
