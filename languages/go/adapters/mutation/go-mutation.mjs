import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { addMetric, hash } from '../../../../shared/rules/finding-helpers.mjs';
import { mutantFindings } from '../../../../shared/rules/mutation.mjs';
import { readGoModule } from '../execution/go-module.mjs';
import { GO_MUTATION_ANALYZER_NAME } from '../go-analyzer.mjs';
import { baselineRun, packagesOf, runMutant, testersOf, uncovered } from './mutation-run.mjs';
import { changeScope, generateMutants, lineReader, onChangedLine } from './mutation-scope.mjs';
import { weakenedTestFindings } from './weakened-tests.mjs';

const MUTATION_REPORT = 'mutation.json';
const REPORTED = new Set(['Survived', 'NoCoverage', 'Timeout']);
const SKIPPED = 'Skipped';
const LISTED_PACKAGES = 5;

function statusOf(context, { mutant, index, packages, testers, baseline }) {
  const runners = testers.get(packages.files.get(mutant.file)) ?? [];
  if (runners.some((name) => baseline.failing.has(name))) {
    return { status: SKIPPED, failing: runners.filter((name) => baseline.failing.has(name)) };
  }
  if (runners.length === 0 || uncovered(mutant, baseline.profile)) {
    return { status: 'NoCoverage' };
  }
  return {
    status: runMutant(context, {
      mutant,
      directory: String(index),
      packages: runners,
      seconds: baseline.seconds,
    }),
  };
}

function writeReport(context, report) {
  writeFileSync(path.join(context.reportRoot, MUTATION_REPORT), JSON.stringify(report));
}

export function mutate(context) {
  if (context.snapshot === 'base') {
    writeReport(context, { results: [], weakened: [] });
    return;
  }
  const scope = changeScope(context);
  const packages = packagesOf(context);
  const mutants = generateMutants(context, {
    scope,
    compiledFiles: new Set(packages.files.keys()),
  });
  if (mutants.length === 0) {
    writeReport(context, { results: [], weakened: [] });
    return;
  }
  const baseline = baselineRun(context, {
    packages: ['./...'],
    modulePath: readGoModule(context.projectRoot)?.module,
  });
  const testers = testersOf(context);
  const results = mutants.map((mutant, index) => ({
    ...mutant,
    ...statusOf(context, { mutant, index, packages, testers, baseline }),
  }));
  const weakened =
    scope.all || scope.testedFolders.size === 0
      ? []
      : weakenedTestFindings(context, { scope, results, seconds: baseline.seconds });
  writeReport(context, {
    results: results.map((result) => ({ ...result, changed: onChangedLine(scope, result) })),
    weakened,
  });
}

function neutralMutants(results, textOf) {
  const counts = new Map();
  return results.map((mutant) => {
    const base = `${mutant.function ?? ''}|${mutant.operator}|${mutant.original}→${mutant.replacement}`;
    const group = `${mutant.status}\0${mutant.file}\0${base}`;
    const occurrence = (counts.get(group) ?? 0) + 1;
    counts.set(group, occurrence);
    const text = textOf(mutant.file, mutant.line);
    return {
      path: mutant.file,
      identity: `${base}#${String(occurrence)}`,
      status: mutant.status,
      label: mutant.operator,
      line: mutant.line,
      column: mutant.column,
      original: mutant.original,
      replacement: mutant.replacement,
      ...(mutant.function === undefined ? {} : { symbol: mutant.function }),
      ...(text === '' ? {} : { anchor: `${mutant.original}→${mutant.replacement}|${hash(text)}` }),
    };
  });
}

function skippedFinding(skipped) {
  const failing = [...new Set(skipped.flatMap(({ failing }) => failing))].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const shown = failing.slice(0, LISTED_PACKAGES).join(', ');
  const more =
    failing.length > LISTED_PACKAGES ? ` and ${String(failing.length - LISTED_PACKAGES)} more` : '';
  return {
    tool: GO_MUTATION_ANALYZER_NAME,
    rule: 'mutation-skipped',
    path: '.',
    identity: 'mutation-skipped:failing-tests',
    message: `Mutation testing skipped ${String(skipped.length)} ${skipped.length === 1 ? 'mutant' : 'mutants'}: the tests of ${shown}${more} fail. Fix the tests and rerun.`,
    classification: 'descriptive',
  };
}

function addSummaries(findings, results) {
  const counts = new Map();
  for (const { status } of results) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  for (const [status, value] of counts) {
    addMetric(findings, {
      analyzerName: GO_MUTATION_ANALYZER_NAME,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      metricName: status,
      value,
    });
  }
}

export function readMutationFindings(context) {
  const { results, weakened } = JSON.parse(
    readFileSync(path.join(context.reportRoot, MUTATION_REPORT), 'utf8'),
  );
  const reported = results.filter(({ status, changed }) => REPORTED.has(status) && changed);
  const skipped = results.filter(({ status }) => status === SKIPPED);
  const findings = [
    ...mutantFindings(neutralMutants(reported, lineReader(context.projectRoot)), {
      tool: GO_MUTATION_ANALYZER_NAME,
    }),
    ...weakened,
    ...(skipped.length === 0 ? [] : [skippedFinding(skipped)]),
  ];
  addSummaries(
    findings,
    results.filter(({ changed }) => changed),
  );
  return findings;
}
