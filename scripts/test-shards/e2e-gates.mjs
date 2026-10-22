import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SUITES = ['java', 'kotlin', 'python'];
const E2E_NAME = '.e2e.test.';
const TEST_FILES = ['{core,shared,languages,scripts}/**/*.test.mjs', 'evals/**/*.test.mjs'];
const FLAG_READ = /process\.env(?:\.|\[\s*['"])(NITPICKER_\w+?_E2E)\b/gu;
const RELATIVE_IMPORT = /(?:from|import)[\s(]*['"](\.{1,2}\/[^'"]+)['"]/gu;

export function suiteFlag(language) {
  return `NITPICKER_${language.toUpperCase()}_E2E`;
}

function flagsRead(file) {
  return [...readFileSync(file, 'utf8').matchAll(FLAG_READ)].map((match) => match[1]);
}

function relativeImports(file) {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)]
    .map((match) => path.resolve(path.dirname(file), match[1]))
    .filter((imported) => existsSync(imported));
}

export function gateCandidates(root) {
  return globSync(TEST_FILES, { cwd: root })
    .map((file) => file.split(path.sep).join('/'))
    .toSorted()
    .flatMap((file) => {
      const absolute = path.join(root, file);
      const flags = [...new Set([absolute, ...relativeImports(absolute)].flatMap(flagsRead))];
      return file.includes(E2E_NAME) || flags.length > 0 ? [{ file, flags: flags.toSorted() }] : [];
    });
}

export function caseId({ file, name }) {
  return `${file} > ${name}`;
}

function gatingSuites(file, { baseline, listed }) {
  const ungated = new Set(baseline.map(caseId));
  return SUITES.filter((suite) =>
    listed[suite].some((entry) => entry.file === file && !ungated.has(caseId(entry))),
  );
}

function candidateProblems({ file, flags }, suites) {
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

export function classifyGates(candidates, listings) {
  const suitesOf = new Map(candidates.map(({ file }) => [file, gatingSuites(file, listings)]));
  const problems = candidates.flatMap((candidate) =>
    candidateProblems(candidate, suitesOf.get(candidate.file)),
  );
  const expected = Object.fromEntries(
    SUITES.map((suite) => [
      suite,
      listings.listed[suite]
        .filter(({ file }) => suitesOf.get(file)?.length === 1 && suitesOf.get(file)[0] === suite)
        .map(caseId)
        .toSorted(),
    ]),
  );
  return { problems, expected };
}

const SHARD_OPTION = '--shard=${{ matrix.shard }}/${{ strategy.job-total }}';

function runsAll(job, commands) {
  const text = (job?.steps ?? []).map((step) => step.run ?? '').join('\n');
  return commands.every((command) => text.includes(command));
}

function checksBoth(job, jobs) {
  const results = Object.values(job?.steps?.[0]?.env ?? {});
  return (
    job !== undefined &&
    String(job.if).includes('always()') &&
    jobs.every(
      (name) =>
        [job.needs].flat().includes(name) && results.includes(`\${{ needs.${name}.result }}`),
    )
  );
}

export function workflowProblems(workflow, language) {
  const shard = `${language}-shard`;
  const plan = `${language}-shard-plan`;
  const others = Object.keys(workflow.jobs).filter((name) => ![shard, plan].includes(name));
  const aggregate = others.length === 1 ? workflow.jobs[others[0]] : undefined;
  return [
    ...(runsAll(workflow.jobs[shard], [`npm run test:${language} -- `, SHARD_OPTION])
      ? []
      : [`${shard} must run test:${language} with ${SHARD_OPTION}`]),
    ...(runsAll(workflow.jobs[plan], [`node scripts/test-shards/verify-e2e-shards.mjs ${language}`])
      ? []
      : [`${plan} must run verify-e2e-shards.mjs ${language}`]),
    ...(checksBoth(aggregate, [plan, shard])
      ? []
      : [`one aggregate job must always run, need ${plan} and ${shard} and check both results`]),
  ];
}
