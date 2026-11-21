import { readSource } from '../migrations/revision-graph.mts';
import { sqlColumnFacts } from './columns/column-facts.mts';
import { drizzleColumnFacts } from './columns/drizzle-columns.mts';
import { prismaColumnFacts } from './columns/prisma-columns.mts';
import { goFacts } from './classes/go-structs.mts';
import { enumNames } from './scanning/enum-names.mts';
import { isJvmFile, jvmClasses, jvmFacts } from './classes/jvm-classes.mts';
import { pythonFacts } from './classes/python-classes.mts';
import {
  isTypescriptFile,
  typescriptClasses,
  typescriptFacts,
} from './classes/typescript-classes.mts';
import { analyse, disagreements, groupFacts } from './compare.mts';
import { finding, looseMessage, specMessage, unboundedMessage } from './messages.mts';
import { requestBoundNames, isTestPath } from './request-bound.mts';
import { isSpecFile, mightBeSpec, specFacts } from './spec/openapi-limits.mts';
import { schemaObjectFacts } from './validators/schema-objects.mts';
import { springValidatorFacts } from './validators/spring-validator.mts';
import { usesGenerator } from './spec/generators.mts';
import type { CombinedBounds, Difference, Fact, FileFacts, ReadText } from './fact-types.mts';
import type { Finding } from '../../values/findings.mts';
import type { ParseYaml, RepositoryContext } from '../check-types.mts';

type Draft = ReturnType<typeof finding>;
type Analysis = ReturnType<typeof analyse>;
type Context = Parameters<typeof analyse>[1];

const SOURCE_FILE = /\.(?:java|kt|ts|tsx|mts|cts|js|mjs|cjs|py|go|prisma)$/u;
const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;

function fileFacts(file: string, text: string): FileFacts {
  if (isJvmFile(file)) {
    return {
      jvm: jvmClasses(file, text),
      enums: enumNames(text),
      facts: springValidatorFacts(file, text),
    };
  }
  if (SCRIPT_FILE.test(file)) {
    const decorated = isTypescriptFile(file) && text.includes('@');
    return {
      typescript: decorated ? typescriptClasses(file, text) : [],
      enums: enumNames(text),
      facts: [...schemaObjectFacts(file, text), ...drizzleColumnFacts(file, text)],
    };
  }
  if (file.endsWith('.py')) {
    return { facts: pythonFacts(file, text) };
  }
  return { facts: file.endsWith('.go') ? goFacts(file, text) : prismaColumnFacts(file, text) };
}

function sourceFacts(files: readonly string[], readText: ReadText): Fact[] {
  const parts = files
    .filter((file) => SOURCE_FILE.test(file) && !isTestPath(file))
    .flatMap((file) => {
      const text = readText(file);
      return text === undefined ? [] : [fileFacts(file, text)];
    });
  const enums = new Set(parts.flatMap((part) => part.enums ?? []));
  return [
    ...parts.flatMap((part) => part.facts ?? []),
    ...jvmFacts(
      parts.flatMap((part) => part.jvm ?? []),
      enums,
    ),
    ...typescriptFacts(
      parts.flatMap((part) => part.typescript ?? []),
      enums,
    ),
  ];
}

function specFactsOf(
  files: readonly string[],
  readText: ReadText,
  parseYaml: ParseYaml | undefined,
): Fact[] {
  return files
    .filter((file) => isSpecFile(file) && !isTestPath(file))
    .flatMap((file) => {
      const text = readText(file);
      return text !== undefined && mightBeSpec(text) ? specFacts(file, text, parseYaml) : [];
    });
}

function primary(group: readonly Fact[]): Fact | undefined {
  return (
    group.find((fact) => fact.kind === 'field') ??
    group.find((fact) => fact.kind === 'column' && fact.style !== 'sql') ??
    group.find((fact) => fact.kind === 'validation') ??
    group.find((fact) => fact.kind === 'spec') ??
    group[0]
  );
}

function unboundedFinding({
  group,
  column,
  effective,
  bound,
}: Analysis & { readonly group: readonly Fact[] }): Draft[] {
  const fact = primary(group);
  if (fact === undefined) {
    return [];
  }
  const enumerated = group.some((member) => member.kind === 'enum');
  const unbounded =
    !enumerated &&
    column !== undefined &&
    effective.max === undefined &&
    !effective.unresolved &&
    bound &&
    fact.style !== 'sql';
  return unbounded
    ? [
        finding({
          fact,
          form: 'unbounded',
          signature: `column ${String(column.width)}`,
          message: unboundedMessage(fact, column),
        }),
      ]
    : [];
}

function looseFinding({ column, effective, limiting }: Analysis): Draft[] {
  return column !== undefined &&
    limiting !== undefined &&
    effective.max !== undefined &&
    effective.max > column.width
    ? [
        finding({
          fact: limiting,
          form: 'loose',
          signature: `column ${String(column.width)} bound ${String(effective.max)}`,
          message: looseMessage(limiting, column, effective.max),
        }),
      ]
    : [];
}

function specFinding(spec: Fact, validation: Fact, explicitBounds: CombinedBounds): Draft[] {
  const differences = disagreements(spec.bounds, explicitBounds);
  return differences.length === 0
    ? []
    : [
        finding({
          fact: spec,
          form: 'spec',
          signature: differences
            .map(
              (d: Difference) => `${d.label} ${String(d.specValue)}/${String(d.validationValue)}`,
            )
            .join(','),
          message: specMessage(spec, validation, differences),
        }),
      ];
}

function groupFindings(group: readonly Fact[], context: Context): Draft[] {
  const facts = analyse(group, context);
  const validation = facts.explicit[0];
  return [
    ...unboundedFinding({ group, ...facts }),
    ...looseFinding(facts),
    ...(validation === undefined
      ? []
      : facts.specs.flatMap((spec) => specFinding(spec, validation, facts.explicitBounds))),
  ];
}

export function fieldLimitFindings(
  tool: string,
  { projectRoot, files, parseYaml }: Pick<RepositoryContext, 'projectRoot' | 'files' | 'parseYaml'>,
): Finding[] {
  function readText(file: string): string | undefined {
    return readSource(projectRoot, file);
  }
  const facts = [
    ...sqlColumnFacts(files, readText),
    ...sourceFacts(files, readText),
    ...specFactsOf(files, readText, parseYaml),
  ];
  const context = {
    bound: requestBoundNames(files, readText),
    generated: usesGenerator(files, readText),
  };
  return groupFacts(facts)
    .flatMap((group) => groupFindings(group, context))
    .map((found) => ({ ...found, tool }));
}
