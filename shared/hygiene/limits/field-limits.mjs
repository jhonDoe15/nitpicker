import { readSource } from '../migrations/revision-graph.mjs';
import { sqlColumnFacts } from './columns/column-facts.mjs';
import { drizzleColumnFacts } from './columns/drizzle-columns.mjs';
import { prismaColumnFacts } from './columns/prisma-columns.mjs';
import { goFacts } from './classes/go-structs.mjs';
import { isJvmFile, jvmClasses, jvmFacts } from './classes/jvm-classes.mjs';
import { pythonFacts } from './classes/python-classes.mjs';
import {
  isTypescriptFile,
  typescriptClasses,
  typescriptFacts,
} from './classes/typescript-classes.mjs';
import { analyse, disagreements, groupFacts } from './compare.mjs';
import { finding, looseMessage, specMessage, unboundedMessage } from './messages.mjs';
import { requestBoundNames, isTestPath } from './request-bound.mjs';
import { isSpecFile, mightBeSpec, specFacts } from './spec/openapi-limits.mjs';
import { schemaObjectFacts } from './validators/schema-objects.mjs';
import { springValidatorFacts } from './validators/spring-validator.mjs';
import { usesGenerator } from './spec/generators.mjs';

const SOURCE_FILE = /\.(?:java|kt|ts|tsx|mts|cts|js|mjs|cjs|py|go|prisma)$/u;
const SCRIPT_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;

function fileFacts(file, text) {
  if (isJvmFile(file)) {
    return { jvm: jvmClasses(file, text), facts: springValidatorFacts(file, text) };
  }
  if (SCRIPT_FILE.test(file)) {
    const decorated = isTypescriptFile(file) && text.includes('@');
    return {
      typescript: decorated ? typescriptClasses(file, text) : [],
      facts: [...schemaObjectFacts(file, text), ...drizzleColumnFacts(file, text)],
    };
  }
  if (file.endsWith('.py')) {
    return { facts: pythonFacts(file, text) };
  }
  return { facts: file.endsWith('.go') ? goFacts(file, text) : prismaColumnFacts(file, text) };
}

function sourceFacts(files, readText) {
  const parts = files
    .filter((file) => SOURCE_FILE.test(file) && !isTestPath(file))
    .flatMap((file) => {
      const text = readText(file);
      return text === undefined ? [] : [fileFacts(file, text)];
    });
  function pick(key) {
    return parts.flatMap((part) => part[key] ?? []);
  }
  return [...pick('facts'), ...jvmFacts(pick('jvm')), ...typescriptFacts(pick('typescript'))];
}

function specFactsOf(files, readText, parseYaml) {
  return files
    .filter((file) => isSpecFile(file) && !isTestPath(file))
    .flatMap((file) => {
      const text = readText(file);
      return text !== undefined && mightBeSpec(text) ? specFacts(file, text, parseYaml) : [];
    });
}

function primary(group) {
  return (
    group.find((fact) => fact.kind === 'field') ??
    group.find((fact) => fact.kind === 'column' && fact.style !== 'sql') ??
    group.find((fact) => fact.kind === 'validation') ??
    group.find((fact) => fact.kind === 'spec') ??
    group[0]
  );
}

function groupFindings(group, context) {
  const { column, explicit, specs, effective, explicitBounds, limiting, bound } = analyse(
    group,
    context,
  );
  const found = [];
  if (column !== undefined && effective.max === undefined && !effective.unresolved && bound) {
    const fact = primary(group);
    found.push(
      finding({
        fact,
        form: 'unbounded',
        signature: `column ${String(column.width)}`,
        message: unboundedMessage(fact, column),
      }),
    );
  }
  if (column !== undefined && effective.max !== undefined && effective.max > column.width) {
    found.push(
      finding({
        fact: limiting,
        form: 'loose',
        signature: `column ${String(column.width)} bound ${String(effective.max)}`,
        message: looseMessage(limiting, column, effective.max),
      }),
    );
  }
  const validation = explicit.length === 0 ? undefined : explicit[0];
  for (const spec of validation === undefined ? [] : specs) {
    const differences = disagreements(spec.bounds, explicitBounds);
    if (differences.length > 0) {
      found.push(
        finding({
          fact: spec,
          form: 'spec',
          signature: differences
            .map((d) => `${d.label} ${String(d.specValue)}/${String(d.validationValue)}`)
            .join(','),
          message: specMessage(spec, validation, differences),
        }),
      );
    }
  }
  return found;
}

export function fieldLimitFindings(tool, { projectRoot, files, parseYaml }) {
  function readText(file) {
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
