import { mutantRuleId } from '../../../../shared/policy.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { baselineRun, packagesOf, runMutant, runnersOf, testersOf } from './mutation-run.mts';
import { generateMutants, lineReader, onChangedLine } from './mutation-scope.mts';
import type { FindingRow, GoContext } from '../go-types.mts';
import type { Mutant, MutantResult, Scope } from './mutation-types.mts';

type Pair = { head: MutantResult; base: Mutant; key: string };

const ESCAPED = new Set(['Survived', 'NoCoverage']);
const CAUGHT = new Set(['Killed', 'Timeout']);
const CODE_LIMIT = 80;

function keyed<Item extends Mutant>(
  mutants: readonly Item[],
  lineText: (file: string, line: number) => string,
) {
  const counts = new Map<string, number>();
  return mutants.map((mutant) => {
    const base = [
      mutant.file,
      mutant.function ?? '',
      mutant.operator,
      mutant.original,
      mutant.replacement,
      lineText(mutant.file, mutant.line),
      String(mutant.column),
    ].join('\0');
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    return { mutant, key: `${base}#${String(occurrence)}` };
  });
}

function escaped(scope: Scope, mutant: MutantResult) {
  return !onChangedLine(scope, mutant) && ESCAPED.has(mutant.status);
}

function baseTwins(
  context: GoContext,
  {
    scope,
    results,
    whole,
  }: { scope: Scope; results: readonly MutantResult[]; whole: readonly string[] },
) {
  const root = context.baselineRoot;
  const packages = packagesOf(context, root);
  const all = generateMutants(context, {
    root,
    scope: { ...scope, changed: new Map() },
    compiledFiles: new Set(packages.files.keys()),
    whole,
  });
  const byKey = new Map(
    keyed(all, lineReader(root)).map(({ mutant, key }): [string, Mutant] => [key, mutant]),
  );
  const wholeFiles = new Set(whole);
  const headKeys = keyed(
    results.filter(({ file }) => wholeFiles.has(file)),
    lineReader(context.projectRoot),
  );
  return {
    packages,
    pairs: headKeys.flatMap(({ mutant, key }): Pair[] => {
      const base = byKey.get(key);
      return escaped(scope, mutant) && base !== undefined ? [{ head: mutant, base, key }] : [];
    }),
  };
}

function inlineCode(value: string) {
  const text = value.replaceAll(/\s+/gu, ' ').trim();
  const shown = text.length > CODE_LIMIT ? `${text.slice(0, CODE_LIMIT)}…` : text;
  return shown === '' ? "`''` (nothing)" : `\`${shown}\``;
}

function weakenedFinding({ head, key }: Pair): FindingRow {
  const rule = mutantRuleId(head.status);
  const outcome = head.status === 'NoCoverage' ? 'no test runs it now' : 'it survives now';
  const allowedForm = 'Restore the assertion that caught it, or add one.';
  const change = `${head.operator} mutant (${inlineCode(head.original)} replaced with ${inlineCode(head.replacement)})`;
  return {
    tool: 'mutation',
    rule,
    path: head.file,
    identity: `weakened|${hash(key)}`,
    message: `This change weakened the tests of ${head.file}: the base tests caught this ${change}, but ${outcome}. ${allowedForm}`,
    allowedForm,
    classification: 'enforceable',
    ...(head.function === undefined ? {} : { symbol: head.function }),
    location: { line: head.line, column: head.column },
  };
}

export function weakenedTestFindings(
  context: GoContext,
  {
    scope,
    results,
    seconds,
    whole,
  }: {
    scope: Scope;
    results: readonly MutantResult[];
    seconds: ReadonlyMap<string, number>;
    whole: readonly string[];
  },
): FindingRow[] {
  if (!results.some((mutant) => whole.includes(mutant.file) && escaped(scope, mutant))) {
    return [];
  }
  const { packages, pairs } = baseTwins(context, { scope, results, whole });
  const testers = testersOf(context, context.baselineRoot);
  function testersOfPair({ base }: Pair) {
    return runnersOf(testers, packages, base.file);
  }
  const needed = [...new Set(pairs.flatMap(testersOfPair))].toSorted((left, right) =>
    left.localeCompare(right),
  );
  if (needed.length === 0) {
    return [];
  }
  const { failing } = baselineRun(context, { root: context.baselineRoot, packages: needed });
  return pairs
    .filter((pair) => {
      const runners = testersOfPair(pair);
      return runners.length > 0 && !runners.some((name) => failing.has(name));
    })
    .filter((pair, index) =>
      CAUGHT.has(
        runMutant(context, {
          mutant: pair.base,
          directory: `base-${String(index)}`,
          packages: testersOfPair(pair),
          seconds,
          root: context.baselineRoot,
        }),
      ),
    )
    .map((pair) => weakenedFinding(pair));
}
