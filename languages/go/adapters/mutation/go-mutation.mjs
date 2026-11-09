import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { addMetric, hash } from '../../../../shared/rules/finding-helpers.mjs';
import { mutantFindings } from '../../../../shared/rules/mutation.mjs';
import { readGoModule } from '../execution/go-module.mjs';
import { GO_MUTATION_ANALYZER_NAME } from '../go-analyzer.mjs';
import { baselineRun, packagesOf, runMutant, testersOf, uncovered } from './mutation-run.mjs';
import {
  changeScope,
  generateMutants,
  lineReader,
  MAX_TESTED_FILES,
  onChangedLine,
  testedFiles,
} from './mutation-scope.mjs';
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

function testedMutants(context, { scope, packages, mutants, tested }) {
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
    tested.files.length === 0
      ? []
      : weakenedTestFindings(context, {
          scope,
          results,
          seconds: baseline.seconds,
          whole: tested.files,
        });
  return {
    results: results.map((result) => ({ ...result, changed: onChangedLine(scope, result) })),
    weakened,
    capped: tested.capped,
  };
}

export function mutate(context) {
  if (context.snapshot === 'base') {
    writeReport(context, { results: [], weakened: [], capped: [] });
    return;
  }
  const scope = changeScope(context);
  const packages = packagesOf(context);
  const compiledFiles = new Set(packages.files.keys());
  const tested = scope.all
    ? { files: [], capped: [] }
    : testedFiles(context, { scope, compiledFiles });
  const mutants = generateMutants(context, { scope, compiledFiles, whole: tested.files });
  writeReport(
    context,
    mutants.length === 0
      ? { results: [], weakened: [], capped: tested.capped }
      : testedMutants(context, { scope, packages, mutants, tested }),
  );
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

function cappedFinding(capped) {
  const named = capped.slice(0, LISTED_PACKAGES).join(', ');
  const more =
    capped.length > LISTED_PACKAGES ? ` and ${String(capped.length - LISTED_PACKAGES)} more` : '';
  return {
    tool: GO_MUTATION_ANALYZER_NAME,
    rule: 'tested-modules-capped',
    path: capped[0],
    identity: `tested-modules-capped|${hash(capped.join('\n'))}`,
    message: `The changed tests sit next to more than ${String(MAX_TESTED_FILES)} files, so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every file.`,
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
  const {
    results,
    weakened,
    capped = [],
  } = JSON.parse(readFileSync(path.join(context.reportRoot, MUTATION_REPORT), 'utf8'));
  const reported = results.filter(({ status, changed }) => REPORTED.has(status) && changed);
  const skipped = results.filter(({ status }) => status === SKIPPED);
  const findings = [
    ...mutantFindings(neutralMutants(reported, lineReader(context.projectRoot)), {
      tool: GO_MUTATION_ANALYZER_NAME,
    }),
    ...weakened,
    ...(skipped.length === 0 ? [] : [skippedFinding(skipped)]),
    ...(capped.length === 0 ? [] : [cappedFinding(capped)]),
  ];
  addSummaries(
    findings,
    results.filter(({ changed }) => changed),
  );
  return findings;
}
