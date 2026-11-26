import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ESLint } from 'eslint';
import { trackTemporaryPath, untrackTemporaryPath } from '../../../adapters/typed/tooling.mts';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import {
  type EngineFinding,
  parsedFiles,
  readEngineFindings,
} from '../../../../../shared/engine/engine-rows.mts';
import { runEngine } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import {
  conditionsHold,
  engineRuleName,
  engineSettings,
  runsOnEngine,
} from '../../eslint-plugin/engine/engine-requests.mts';
import type { LintMessage, LintResult } from '../../../adapters/oxlint/plan/oxlint-shapes.mts';

type Rules = Readonly<Record<string, unknown>>;
type Planned = { readonly file: string; readonly rules: Rules };
type EngineLint = {
  readonly eslint: ESLint;
  readonly root: string;
  readonly files: readonly string[];
  readonly environment: Environment;
};
export type EngineLinted = {
  readonly results: readonly LintResult[];
  readonly unparsed: readonly string[];
};

const SEVERITIES: Readonly<Record<string, number>> = { off: 0, warn: 1, error: 2 };

function severityOf(setting: unknown): number {
  const level: unknown = Array.isArray(setting) ? setting[0] : setting;
  return typeof level === 'number' ? level : (SEVERITIES[String(level)] ?? 0);
}

function enabledRules(config: unknown): Rules {
  return Object.fromEntries(
    Object.entries(fieldsOf(fieldOf(config, 'rules'))).filter(
      ([, setting]) => severityOf(setting) > 0,
    ),
  );
}

async function planned(eslint: ESLint, file: string): Promise<Planned> {
  if (await eslint.isPathIgnored(file)) {
    return { file, rules: {} };
  }
  const config: unknown = await eslint.calculateConfigForFile(file);
  return { file, rules: enabledRules(config) };
}

function messageOf(finding: EngineFinding, setting: unknown): LintMessage {
  return {
    ruleId: finding.rule,
    message: finding.message,
    severity: severityOf(setting),
    line: finding.line,
    column: finding.column,
    ...(finding.end === undefined
      ? {}
      : { endLine: finding.end.line, endColumn: finding.end.column }),
  };
}

function byPlace(left: LintMessage, right: LintMessage): number {
  return left.line - right.line || left.column - right.column;
}

function resultsOf(
  plans: readonly Planned[],
  findings: readonly EngineFinding[],
  parsed: ReadonlySet<string>,
): LintResult[] {
  const byFile = Map.groupBy(findings, (finding) => finding.file);
  return plans
    .filter(({ file }) => parsed.has(file))
    .map(({ file, rules }) => ({
      filePath: file,
      messages: (byFile.get(file) ?? [])
        .filter(
          (found) => found.rule in rules && conditionsHold(found.rule, found.conditions, file),
        )
        .map((found) => messageOf(found, rules[found.rule]))
        .sort(byPlace),
    }));
}

async function writtenList(
  { root, environment }: EngineLint,
  plans: readonly Planned[],
  { directory, chosen }: { directory: string; chosen: ReadonlySet<string> },
): Promise<string> {
  const list = path.join(directory, 'files.tsv');
  const project = { root, environment };
  const lines = plans.map(({ file, rules }) =>
    [file, file, ...engineSettings({ rules, filename: file, chosen, project })].join('\t'),
  );
  await writeFile(list, `${lines.join('\n')}\n`);
  return list;
}

function lintedFrom(out: string, plans: readonly Planned[]): EngineLinted {
  const findings = readEngineFindings(out);
  const files = plans.map(({ file }) => file);
  const parsed = new Set(parsedFiles(files, findings));
  return {
    results: resultsOf(plans, findings, parsed),
    unparsed: files.filter((file) => !parsed.has(file)),
  };
}

async function runPlanned(
  request: EngineLint,
  binary: string,
  plans: readonly Planned[],
): Promise<EngineLinted | undefined> {
  const chosen = new Set(plans.flatMap(({ rules }) => Object.keys(rules)));
  const directory = trackTemporaryPath(
    await mkdtemp(path.join(tmpdir(), 'nitpicker-coding-standards-')),
  );
  try {
    const list = await writtenList(request, plans, { directory, chosen });
    const out = path.join(directory, 'findings.json');
    const rules = [...chosen].map(engineRuleName).sort().join(',');
    const run = await runEngine(
      ['typescript-lint', '--files', list, '--rules', rules, '--out', out],
      { binary, cwd: request.root },
    );
    return run.status === 0 ? lintedFrom(out, plans) : undefined;
  } finally {
    await rm(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export async function lintWithEngine(request: EngineLint): Promise<EngineLinted | undefined> {
  const binary = findEngine(request.environment);
  if (binary === undefined) {
    return undefined;
  }
  const files = [...new Set(request.files.map((file) => path.resolve(request.root, file)))];
  const plans = await Promise.all(files.map((file) => planned(request.eslint, file)));
  const settings = plans.flatMap(({ rules }) => Object.entries(rules));
  if (!settings.every(runsOnEngine)) {
    return undefined;
  }
  const linted = plans.filter(({ rules }) => Object.keys(rules).length > 0);
  if (linted.length === 0) {
    return { results: [], unparsed: [] };
  }
  return runPlanned(request, binary, linted);
}
