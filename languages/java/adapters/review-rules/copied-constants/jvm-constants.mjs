import { isConstantName } from '../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { initializerValue } from './jvm-values.mjs';

const ASSIGNMENT = '=';
const END = ';';

function initializerTexts(tokens) {
  const assign = tokens.indexOf(ASSIGNMENT);
  if (assign === -1) {
    return [];
  }
  const end = tokens.at(-1) === END ? -1 : tokens.length;
  return tokens.slice(assign + 1, end);
}

function constantOf(file, parsed, definition) {
  if (definition.kind !== 'const' || !definition.exported || !isConstantName(definition.name)) {
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

/** The non-private UPPER_SNAKE constants with one literal value that parsed main sources declare. */
export function mainConstants(sources) {
  return sources.flatMap(({ file, parsed }) =>
    parsed.definitions
      .map((definition) => constantOf(file, parsed, definition))
      .filter((constant) => constant !== undefined),
  );
}
