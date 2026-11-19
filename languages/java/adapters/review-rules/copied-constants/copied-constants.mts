import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import {
  copiedConstantMessage as untypedCopiedConstantMessage,
  valueKey as untypedValueKey,
} from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { readJvmDefinitions } from '../../reuse/source/jvm-definitions.mts';
import { pathInside, sourceFilesUnder, sourceRootsOf } from '../java-sources.mts';
import type { ImportEntry } from '../../reuse/jvm-reuse-types.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type {
  Constant,
  ConstantPolicy,
  ConstantProject,
  JvmSource,
  Literal,
  MentionedConstant,
} from './constant-types.mts';
import { mainConstants } from './jvm-constants.mts';
import { testLiterals } from './test-literals.mts';

const valueKey: (literal: Literal) => string = untypedValueKey;
const copiedConstantMessage: (parts: {
  names: string[];
  owner: string;
  literal: Literal;
  pin: string;
}) => string = untypedCopiedConstantMessage;
const matcherOf: (glob: string) => Matcher = globMatcher;

type Matcher = { test: (file: string) => boolean };

export const COPIED_CONSTANT_RULE = 'CopiedConstantInTest';
export const COPIED_CONSTANT_EXCEPTION_RULE = `pmd/${COPIED_CONSTANT_RULE}`;
export const COPIED_CONSTANT_PIN = 'assertEquals({value}, {name})';
function parsedSources(
  projectRoot: string,
  roots: readonly string[],
  { kotlin, excluded }: { kotlin: boolean; excluded: readonly Matcher[] },
): JvmSource[] {
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  const files = [...new Set(roots)]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), extensions))
    .map((full) => path.relative(projectRoot, full).replaceAll('\\', '/'))
    .filter((file) => !excluded.some((matcher) => matcher.test(file)));
  return [...new Set(files)].map((file) => ({
    file,
    kotlin: file.endsWith('.kt'),
    parsed: readJvmDefinitions(readFileSync(pathInside(projectRoot, file), 'utf8'), {
      kotlin: file.endsWith('.kt'),
      nested: true,
    }),
  }));
}

function imported(imports: readonly ImportEntry[], target: string): boolean {
  return imports.some(({ path: name, wildcard }) => !wildcard && name === target);
}

function onDemand(imports: readonly ImportEntry[], owner: string): boolean {
  return imports.some(({ path: name, wildcard }) => wildcard && name === owner);
}

function ownerNames(test: JvmSource, constant: Constant): string[] {
  const { imports, packageName } = test.parsed;
  const types = (constant.owner ?? '').split('.');
  return types.flatMap((type, depth) => {
    const outer = [constant.packageName, ...types.slice(0, depth)].join('.');
    const qualified = `${outer}.${type}`;
    const aliases = imports.flatMap(({ path: name, alias }) =>
      alias !== undefined && name === qualified ? [alias] : [],
    );
    const visible =
      (depth === 0 && packageName === constant.packageName) ||
      imported(imports, qualified) ||
      onDemand(imports, outer);
    return [...(visible ? [type] : []), ...aliases];
  });
}

function memberImport(
  test: JvmSource,
  constant: Constant,
  prefix: string,
): ImportEntry | undefined {
  return test.parsed.imports.find(
    ({ path: name, wildcard }) =>
      (!wildcard && name === `${prefix}.${constant.name}`) || (wildcard && name === prefix),
  );
}

function isName(name: string | undefined): name is string {
  return name !== undefined && name !== '';
}

function sees(
  test: JvmSource,
  constant: Constant,
  identifiers: ReadonlySet<string>,
): string[] | undefined {
  if (constant.owner === undefined) {
    if (!test.kotlin) {
      return undefined;
    }
    const direct = memberImport(test, constant, constant.packageName);
    const samePackage = test.parsed.packageName === constant.packageName;
    return samePackage || direct !== undefined
      ? [constant.name, direct?.alias].filter(isName)
      : undefined;
  }
  const member = memberImport(test, constant, `${constant.packageName}.${constant.owner}`);
  if (member !== undefined) {
    return [constant.name, member.alias].filter(isName);
  }
  const owners = ownerNames(test, constant).filter((name) => identifiers.has(name));
  return owners.length > 0 ? [constant.name] : undefined;
}

function visibleConstants(
  test: JvmSource,
  constants: readonly Constant[],
): Map<string, MentionedConstant[]> {
  const identifiers = new Set(
    test.parsed.tokens
      .slice(test.parsed.headerEnd)
      .filter(({ kind }) => kind === 'identifier')
      .map(({ text }) => text),
  );
  const byValue = new Map<string, MentionedConstant[]>();
  for (const constant of constants) {
    const mentions = sees(test, constant, identifiers);
    if (mentions !== undefined) {
      const key = valueKey(constant.value);
      byValue.set(key, [...(byValue.get(key) ?? []), { ...constant, mentions }]);
    }
  }
  return byValue;
}

function displayName(constant: Constant): string {
  return constant.owner === undefined ? constant.name : `${constant.owner}.${constant.name}`;
}

function testFindings(test: JvmSource, constants: readonly Constant[]): ReviewFinding[] {
  const finding = findingFactory();
  const byValue = visibleConstants(test, constants);
  if (byValue.size === 0) {
    return [];
  }
  return testLiterals(test.parsed, { kotlin: test.kotlin }).flatMap((literal) => {
    const copied = byValue.get(valueKey(literal.value));
    if (copied === undefined) {
      return [];
    }
    const names = literal.names();
    if (copied.some(({ mentions }) => mentions.some((name) => names.has(name)))) {
      return [];
    }
    const sorted = copied.toSorted((left, right) =>
      displayName(left).localeCompare(displayName(right)),
    );
    const shown = [...new Set(sorted.map(displayName))];
    return [
      finding({
        rule: COPIED_CONSTANT_RULE,
        file: test.file,
        line: literal.line,
        symbol: shown[0] ?? '',
        key: `${shown[0] ?? ''}:${valueKey(literal.value)}`,
        message: copiedConstantMessage({
          names: shown,
          owner: [...new Set(sorted.map(({ file }) => file))].join(' and '),
          literal: literal.value,
          pin: COPIED_CONSTANT_PIN,
        }),
      }),
    ];
  });
}

export function readCopiedConstantFindings(
  projectRoot: string,
  {
    projects,
    kotlin,
    policy = {},
  }: {
    projects: readonly ConstantProject[];
    kotlin: boolean;
    policy?: ConstantPolicy;
  },
): ReviewFinding[] {
  const excluded = (policy.exclude ?? []).map((glob) => matcherOf(glob));
  const tests = parsedSources(
    projectRoot,
    projects.flatMap((project) => sourceRootsOf(project, { kotlin, test: true })),
    { kotlin, excluded },
  );
  if (tests.length === 0) {
    return [];
  }
  const constants = mainConstants(
    parsedSources(
      projectRoot,
      projects.flatMap((project) => sourceRootsOf(project, { kotlin, test: false })),
      { kotlin, excluded },
    ),
  );
  if (constants.length === 0) {
    return [];
  }
  return tests.flatMap((test) => testFindings(test, constants));
}
