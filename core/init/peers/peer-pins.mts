import { firstVersionIn, rangesOverlap, satisfiesRange } from './version-range.mts';

export type VitestPeerTable = Readonly<Record<number, Readonly<Record<string, string>>>>;

export type VitestChoice =
  | { readonly kind: 'fits'; readonly vitest: string; readonly coverage: string }
  | { readonly kind: 'blocked'; readonly advice: string };

export type FoundVersion = { readonly exact?: string; readonly declared?: string };

type VitestInputs = {
  readonly supported: string;
  readonly peers: VitestPeerTable;
  readonly versionOf: (name: string) => FoundVersion | undefined;
  readonly addCommand: string;
};

const UPPER_BOUND = /<\s*\d[\w.-]*/u;
const CLAUSE_VERSION = /\^\s*(?<version>\d[\w.-]*)/gu;

function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function typescriptRequirement(supported: string, toolRange: unknown): string {
  const capped = cappedRange(supported.trim(), toolRange);
  return capped === supported.trim() ? 'typescript' : `typescript@${capped}`;
}

export function cappedRange(lower: string, toolRange: unknown): string {
  const upper = UPPER_BOUND.exec(textOf(toolRange))?.[0].replace(/\s+/gu, '');
  return upper === undefined ? lower : `${lower} ${upper}`;
}

function supportedMajors(range: string): { readonly major: number; readonly range: string }[] {
  return [...range.matchAll(CLAUSE_VERSION)]
    .map(({ groups }) => ({
      major: Number.parseInt(groups?.['version'] ?? '', 10),
      range: `^${String(groups?.['version'])}`,
    }))
    .toSorted((left, right) => right.major - left.major);
}

function unmet(
  peers: Readonly<Record<string, string>>,
  versionOf: (name: string) => FoundVersion | undefined,
): { readonly name: string; readonly version: string; readonly range: string } | undefined {
  for (const [name, range] of Object.entries(peers)) {
    const found = versionOf(name);
    const version = found?.exact ?? found?.declared;
    const fits =
      found?.exact === undefined
        ? found?.declared === undefined || rangesOverlap(found.declared, range)
        : satisfiesRange(found.exact, range);
    if (version !== undefined && !fits) {
      return { name, version, range };
    }
  }
  return undefined;
}

function blockedAdvice(
  candidates: readonly { readonly major: number; readonly problem: ReturnType<typeof unmet> }[],
  { supported, addCommand }: VitestInputs,
): string {
  const reasons = candidates.map(({ major, problem }) =>
    problem === undefined
      ? ''
      : `Vitest ${String(major)} needs ${problem.name} ${problem.range} but the project has ${problem.version}`,
  );
  const names = [...new Set(candidates.map(({ problem }) => problem?.name))].filter(
    (name) => name !== undefined,
  );
  const first = names[0] ?? 'the package';
  return (
    `No Vitest that nitpicker supports (${supported}) runs with the installed packages: ` +
    `${reasons.filter(Boolean).join('; ')}. ` +
    `Upgrade ${names.join(' and ')} first (for example ${addCommand} ${first}@latest), ` +
    'then run nitpicker init again.'
  );
}

export function chooseVitest(inputs: VitestInputs): VitestChoice {
  const candidates = supportedMajors(inputs.supported).map(({ major, range }) => ({
    major,
    range,
    problem: unmet(inputs.peers[major] ?? {}, inputs.versionOf),
  }));
  const fitting = candidates.find(({ problem }) => problem === undefined);
  if (fitting === undefined) {
    return { kind: 'blocked', advice: blockedAdvice(candidates, inputs) };
  }
  return fitting === candidates[0]
    ? { kind: 'fits', vitest: 'vitest', coverage: '@vitest/coverage-v8' }
    : {
        kind: 'fits',
        vitest: `vitest@${fitting.range}`,
        coverage: `@vitest/coverage-v8@${fitting.range}`,
      };
}

export function minimumOf(range: unknown): string | undefined {
  return firstVersionIn(textOf(range));
}
