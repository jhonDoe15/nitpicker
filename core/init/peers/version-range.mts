const VERSION =
  /(?<major>\d+)(?:\.(?<minor>\d+|[xX*]))?(?:\.(?<patch>\d+|[xX*]))?(?<pre>-[0-9A-Za-z.-]+)?/u;
const COMPARATOR = /^(?<operator>>=|<=|>|<|=|\^|~)?\s*(?<version>\S.*)$/u;
const FULL_VERSION_PARTS = 3;

type Version = readonly [number, number, number, number];

function wildcard(part: string | undefined): boolean {
  return part === undefined || /^[xX*]$/u.test(part);
}

function numberOf(part: string | undefined): number {
  return wildcard(part) ? 0 : Number(part);
}

function partsOf(text: string): { readonly version: Version; readonly given: number } | undefined {
  const groups = VERSION.exec(text)?.groups;
  if (groups === undefined) {
    return undefined;
  }
  const given = [groups['major'], groups['minor'], groups['patch']].filter(
    (part) => !wildcard(part),
  ).length;
  return {
    version: [
      numberOf(groups['major']),
      numberOf(groups['minor']),
      numberOf(groups['patch']),
      groups['pre'] === undefined ? 1 : 0,
    ],
    given,
  };
}

function compare(left: Version, right: Version): number {
  const index = left.findIndex((part, position) => part !== right[position]);
  return index === -1 ? 0 : Math.sign((left[index] ?? 0) - (right[index] ?? 0));
}

function upperBound(version: Version, given: number, operator: string | undefined): Version {
  if (operator === '^' && version[0] > 0) {
    return [version[0] + 1, 0, 0, 1];
  }
  if (operator === '^' && version[1] > 0 && given > 1) {
    return [0, version[1] + 1, 0, 1];
  }
  if (operator === '^' && given > 2) {
    return [0, 0, version[2] + 1, 1];
  }
  if (operator === '~' && given > 1) {
    return [version[0], version[1] + 1, 0, 1];
  }
  return given > 1 ? [version[0], version[1] + 1, 0, 1] : [version[0] + 1, 0, 0, 1];
}

const BOUND_TESTS: Readonly<Record<string, (order: number) => boolean>> = {
  '>=': (order) => order >= 0,
  '>': (order) => order > 0,
  '<=': (order) => order <= 0,
  '<': (order) => order < 0,
};

function within(version: Version, floor: Version, upper: Version): boolean {
  return compare(version, floor) >= 0 && compare(version, upper) < 0;
}

function matches(version: Version, comparator: string): boolean {
  const { operator, version: text } = COMPARATOR.exec(comparator.trim())?.groups ?? {};
  const bound = partsOf(text ?? '');
  if (bound === undefined || wildcard(text)) {
    return true;
  }
  const { version: floor, given } = bound;
  const test = BOUND_TESTS[operator ?? ''];
  if (test !== undefined) {
    return test(compare(version, floor));
  }
  if (operator === '^' || operator === '~') {
    return within(version, floor, upperBound(floor, given, operator));
  }
  if (given === FULL_VERSION_PARTS) {
    return compare(version, floor) === 0;
  }
  return within(version, floor, upperBound(floor, given, undefined));
}

function comparatorsOf(range: string): string[] {
  return range
    .replace(/(>=|<=|>|<|=|\^|~)\s+/gu, '$1')
    .split(/\s+/u)
    .filter(Boolean);
}

export function satisfiesRange(version: string, range: string): boolean {
  const parsed = partsOf(version);
  if (parsed === undefined) {
    return true;
  }
  return range
    .split('||')
    .some((alternative) =>
      comparatorsOf(alternative).every((comparator) => matches(parsed.version, comparator)),
    );
}

export function firstVersionIn(range: string): string | undefined {
  return VERSION.exec(range)?.[0];
}

const PROBE_LIMIT = 40;
const PROBE_MINORS = [...Array.from({ length: 13 }, (_, index) => index), 99];

const PROBES = Array.from({ length: PROBE_LIMIT }, (_, major) => major).flatMap((major) =>
  PROBE_MINORS.map((minor) => `${String(major)}.${String(minor)}.0`),
);

export function rangesOverlap(left: string, right: string): boolean {
  return PROBES.some((probe) => satisfiesRange(probe, left) && satisfiesRange(probe, right));
}
