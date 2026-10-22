import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPOSITORY_ROOT,
  demonstrationDiffs,
  evaluateFixtures,
  evaluateLookup,
  summarize,
} from './evaluate.mjs';
import { canonicalJson } from './report/canonical.mjs';
import { parsedFindings } from './report/findings.mjs';
import { flowView, witnessView } from './report/view.mjs';

const OUTPUT = 'reports/flow-model';

function write(root, relative, text) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function targetRow(target) {
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
    oracle:
      target.comparison === undefined
        ? null
        : { agree: target.comparison.agree, executions: target.comparison.executions },
    sizes: target.sizes,
    key: target.key,
  };
}

function writeTargets(root, folder, targets) {
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

export function generate(root = fileURLToPath(REPOSITORY_ROOT)) {
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
  write(root, `${OUTPUT}/real/unchanged-view.md`, flowView(lookup.variants[0]));
  write(root, `${OUTPUT}/diff.json`, `${canonicalJson(demonstrationDiffs(lookup), 2)}\n`);
  write(root, `${OUTPUT}/findings.json`, `${canonicalJson({ findings }, 2)}\n`);
  const rows = [...fixtures, ...lookup.variants].map(targetRow);
  write(root, `${OUTPUT}/summary.json`, `${canonicalJson({ summary, targets: rows }, 2)}\n`);
  return { summary, findings: findings.length, targets: targets.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { summary, findings } = generate();
  process.stdout.write(`${JSON.stringify({ ...summary, findings }, null, 2)}\n`);
}
