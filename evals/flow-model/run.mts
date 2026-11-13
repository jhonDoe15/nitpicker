import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Evaluated } from './evaluate.mts';
import {
  REPOSITORY_ROOT,
  demonstrationDiffs,
  evaluateFixtures,
  evaluateLookup,
  summarize,
} from './evaluate.mts';
import { canonicalJson } from './report/canonical.mts';
import { parsedFindings } from './report/findings.mts';
import { flowView, witnessView } from './report/view.mts';

const OUTPUT = 'reports/flow-model';

function write(root: string, relative: string, text: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function targetRow(target: Evaluated) {
  return {
    name: target.name,
    kind: target.kind ?? 'fixture',
    file: target.file,
    status: target.result.status,
    labelMatch: target.labelMatch,
    violations: target.result.violations.map(
      (violation) => `${violation.signature} (${violation.certainty})`,
    ),
    reasons: target.result.reasons.map(
      (reason) => `${reason.reason} ${String(reason.line)}:${String(reason.column)}`,
    ),
    paths: target.result.paths.length,
    oracle: {
      mode: target.comparison.mode,
      agree: target.comparison.agree,
      executions: target.comparison.executions,
    },
    sizes: target.sizes,
    key: target.key,
  };
}

function writeTargets(root: string, folder: string, targets: readonly Evaluated[]): void {
  for (const target of targets) {
    write(root, target.file, target.text);
    write(root, `${folder}/models/${target.name}.json`, `${canonicalJson(target.model, 2)}\n`);
    write(root, `${folder}/results/${target.name}.json`, `${canonicalJson(target.result, 2)}\n`);
  }
  write(root, `${folder}/views.md`, targets.map((target) => flowView(target)).join('\n'));
  write(
    root,
    `${folder}/witnesses.md`,
    targets.flatMap((target) => witnessView(target)).join('\n'),
  );
}

export function generate(root: string = fileURLToPath(REPOSITORY_ROOT)) {
  rmSync(path.join(root, OUTPUT), { recursive: true, force: true });
  const fixtures = evaluateFixtures();
  const lookup = evaluateLookup();
  const targets = [
    ...fixtures,
    ...lookup.variants.filter((variant) => variant.kind !== 'unchanged'),
  ];
  const findings = parsedFindings(
    [...fixtures, ...lookup.variants].flatMap((target) => target.findings),
  );
  const summary = summarize(fixtures, lookup);
  writeTargets(root, `${OUTPUT}/synthetic`, fixtures);
  writeTargets(
    root,
    `${OUTPUT}/real`,
    lookup.variants.filter((variant) => variant.kind !== 'unchanged'),
  );
  const [unchanged] = lookup.variants;
  if (unchanged === undefined) {
    throw new Error('flow-model: the lookup evaluation produced no variants');
  }
  write(root, `${OUTPUT}/real/unchanged-view.md`, flowView(unchanged));
  write(root, `${OUTPUT}/diff.json`, `${canonicalJson(demonstrationDiffs(lookup.variants), 2)}\n`);
  write(root, `${OUTPUT}/findings.json`, `${canonicalJson({ findings }, 2)}\n`);
  const rows = [...fixtures, ...lookup.variants].map(targetRow);
  write(root, `${OUTPUT}/summary.json`, `${canonicalJson({ summary, targets: rows }, 2)}\n`);
  return { summary, findings: findings.length, targets: targets.length };
}

function launchedDirectly(): boolean {
  return (
    process.argv[1] !== undefined &&
    realpathSync(process.argv[1]) === realpathSync(import.meta.filename)
  );
}

if (launchedDirectly()) {
  const { summary, findings } = generate();
  process.stdout.write(`${canonicalJson({ ...summary, findings }, 2)}\n`);
}
