import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Fields, fieldsOf, listOf } from '../json/fields.mts';
import type { Environment } from '../../shared/processes/environment.mts';

export type GateCandidate = { readonly file: string; readonly flags: readonly string[] };
export type ListedCase = { readonly file: string; readonly name: string };
export type SuiteListings = {
  readonly baseline: readonly ListedCase[];
  readonly listed: Readonly<Record<string, readonly ListedCase[]>>;
};

export const SUITES = ['java', 'kotlin', 'python', 'go'];
const E2E_NAME = '.e2e.test.';
export const TEST_FILES = [
  '{core,shared,languages,scripts}/**/*.test.{mjs,mts}',
  'evals/**/*.test.{mjs,mts}',
];
const FLAG_READ = /process\.env(?:\.|\[\s*['"])(NITPICKER_\w+?_E2E)\b/gu;
const RELATIVE_IMPORT = /(?:from|import)[\s(]*['"](\.{1,2}\/[^'"]+)['"]/gu;
const RELATIVE_RE_EXPORT = /export\s*(?:\*|\{[^}]*\})\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/gu;

export function suiteFlag(language: string): string {
  return `NITPICKER_${language.toUpperCase()}_E2E`;
}

function flagsRead(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(FLAG_READ)].flatMap((match) => match[1] ?? []);
}

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)]
    .flatMap((match) =>
      match[1] === undefined ? [] : [path.resolve(path.dirname(file), match[1])],
    )
    .filter((imported) => existsSync(imported));
}

function reExports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE_RE_EXPORT)]
    .flatMap((match) =>
      match[1] === undefined ? [] : [path.resolve(path.dirname(file), match[1])],
    )
    .filter((exported) => existsSync(exported));
}

function withReExports(modules: readonly string[]): string[] {
  const found = new Set(modules);
  for (const module of found) {
    for (const exported of reExports(module)) {
      found.add(exported);
    }
  }
  return [...found];
}

export function gateCandidates(root: string): GateCandidate[] {
  return globSync(TEST_FILES, { cwd: root })
    .map((file) => file.split(path.sep).join('/'))
    .toSorted()
    .flatMap((file) => {
      const absolute = path.join(root, file);
      const modules = withReExports([absolute, ...relativeImports(absolute)]);
      const flags = [...new Set(modules.flatMap(flagsRead))];
      return file.includes(E2E_NAME) || flags.length > 0 ? [{ file, flags: flags.toSorted() }] : [];
    });
}

export function suiteFiles(root: string, environment: Environment): string[] {
  const flags = SUITES.map(suiteFlag).filter((flag) => environment[flag] === '1');
  if (flags.length === 0) {
    return [];
  }
  return gateCandidates(root)
    .filter((candidate) => candidate.flags.some((flag) => flags.includes(flag)))
    .map(({ file }) => file);
}

export function caseId({ file, name }: ListedCase): string {
  return `${file} > ${name}`;
}

function gatingSuites(file: string, { baseline, listed }: SuiteListings): string[] {
  const ungated = new Set(baseline.map(caseId));
  return SUITES.filter((suite) =>
    (listed[suite] ?? []).some((entry) => entry.file === file && !ungated.has(caseId(entry))),
  );
}

function candidateProblems({ file, flags }: GateCandidate, suites: readonly string[]): string[] {
  const known = new Set(SUITES.map(suiteFlag));
  return [
    ...(suites.length === 1
      ? []
      : [`${file} is gated by ${suites.map(suiteFlag).join(' and ') || 'no suite flag'}`]),
    ...flags
      .filter((flag) => !known.has(flag))
      .map((flag) => `${file} reads ${flag}, which no suite sets`),
    ...flags
      .filter((flag) => known.has(flag) && !suites.map(suiteFlag).includes(flag))
      .map((flag) => `${file} reads ${flag} but does not list under it`),
  ];
}

export function classifyGates(
  candidates: readonly GateCandidate[],
  listings: SuiteListings,
): { problems: string[]; expected: Record<string, string[]> } {
  const suitesOf = new Map(candidates.map(({ file }) => [file, gatingSuites(file, listings)]));
  const problems = candidates.flatMap((candidate) =>
    candidateProblems(candidate, suitesOf.get(candidate.file) ?? []),
  );
  const expected = Object.fromEntries(
    SUITES.map((suite) => [
      suite,
      (listings.listed[suite] ?? [])
        .filter(({ file }) => suitesOf.get(file)?.length === 1 && suitesOf.get(file)?.[0] === suite)
        .map(caseId)
        .toSorted(),
    ]),
  );
  return { problems, expected };
}

function workflowExpression(expression: string): string {
  return `\${{ ${expression} }}`;
}

const SHARD_OPTION = `--shard=${workflowExpression('matrix.shard')}/${workflowExpression('strategy.job-total')}`;

function runsAll(job: Fields | undefined, commands: readonly string[]): boolean {
  const text = listOf(job?.['steps'])
    .map((step) => fieldsOf(step)?.['run'])
    .map((run) => (typeof run === 'string' ? run : ''))
    .join('\n');
  return commands.every((command) => text.includes(command));
}

function checksBoth(job: Fields | undefined, jobs: readonly string[]): boolean {
  const results = Object.values(fieldsOf(fieldsOf(listOf(job?.['steps'])[0])?.['env']) ?? {});
  return (
    job !== undefined &&
    String(job['if']).includes('always()') &&
    jobs.every(
      (name) =>
        [job['needs']].flat().includes(name) &&
        results.includes(workflowExpression(`needs.${name}.result`)),
    )
  );
}

function jobNamed(jobs: Fields, name: string): Fields | undefined {
  return fieldsOf(jobs[name]);
}

export function workflowProblems(workflow: unknown, language: string): string[] {
  const shard = `${language}-shard`;
  const plan = `${language}-shard-plan`;
  const jobs = fieldsOf(fieldsOf(workflow)?.['jobs']) ?? {};
  const others = Object.keys(jobs).filter((name) => ![shard, plan, 'changes'].includes(name));
  const aggregate =
    others.length === 1 && others[0] !== undefined ? jobNamed(jobs, others[0]) : undefined;
  return [
    ...(runsAll(jobNamed(jobs, shard), [`npm run test:${language} -- `, SHARD_OPTION])
      ? []
      : [`${shard} must run test:${language} with ${SHARD_OPTION}`]),
    ...(runsAll(jobNamed(jobs, plan), [
      `node scripts/test-shards/verify-e2e-shards.mts ${language}`,
    ])
      ? []
      : [`${plan} must run verify-e2e-shards.mts ${language}`]),
    ...(checksBoth(aggregate, [plan, shard])
      ? []
      : [`one aggregate job must always run, need ${plan} and ${shard} and check both results`]),
    ...(jobs['changes'] === undefined || checksBoth(aggregate, ['changes'])
      ? []
      : ['the aggregate job must also need changes and check its result']),
  ];
}

export function shardMatrix(workflow: unknown, language: string): number[] {
  const job = fieldsOf(fieldsOf(fieldsOf(workflow)?.['jobs'])?.[`${language}-shard`]);
  const matrix = fieldsOf(fieldsOf(job?.['strategy'])?.['matrix']);
  return listOf(matrix?.['shard']).filter((shard) => typeof shard === 'number');
}
