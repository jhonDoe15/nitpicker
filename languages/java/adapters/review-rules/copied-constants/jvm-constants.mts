import { isConstantName as untypedIsConstantName } from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import type { Definition, Parsed } from '../../reuse/jvm-reuse-types.mts';
import type { Constant, JvmSource } from './constant-types.mts';
import { initializerValue } from './jvm-values.mts';

const isConstantName: (name: string) => boolean = untypedIsConstantName;

const ASSIGNMENT = '=';
const END = ';';

function initializerTexts(tokens: readonly string[]): string[] {
  const assign = tokens.indexOf(ASSIGNMENT);
  if (assign === -1) {
    return [];
  }
  const end = tokens.at(-1) === END ? -1 : tokens.length;
  return tokens.slice(assign + 1, end);
}

function constantOf(file: string, parsed: Parsed, definition: Definition): Constant | undefined {
  if (
    definition.kind !== 'const' ||
    definition['exported'] !== true ||
    !isConstantName(definition.name)
  ) {
    return undefined;
  }
  const value = initializerValue(initializerTexts(definition.tokens), {
    kotlin: file.endsWith('.kt'),
  });
  return value === undefined
    ? undefined
    : {
        name: definition.name,
        owner: definition.owner,
        packageName: parsed.packageName,
        file,
        value,
      };
}

export function mainConstants(sources: readonly JvmSource[]): Constant[] {
  return sources.flatMap(({ file, parsed }) =>
    parsed.definitions
      .map((definition) => constantOf(file, parsed, definition))
      .filter((constant): constant is Constant => constant !== undefined),
  );
}
