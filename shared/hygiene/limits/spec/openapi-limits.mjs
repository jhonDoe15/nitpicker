import { parsedConfig } from '../../schema/sources/sqlc-schemas.mjs';
import { makeFact } from '../scanning/facts.mjs';
import { patternLength } from '../scanning/pattern-length.mjs';
import { combineBounds } from '../validators/bounds.mjs';
import { appendAll } from '../../../lists/items.mjs';

const SPEC_FILE = /\.(?:ya?ml|json)$/iu;
const SPEC_MARKER = /["']?(?:openapi|swagger|\$schema)["']?\s*:/u;
const MARKER_WINDOW = 4000;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSpecFile(file) {
  return SPEC_FILE.test(file);
}

export function mightBeSpec(text) {
  return SPEC_MARKER.test(text.slice(0, MARKER_WINDOW)) || text.includes('components:');
}

function schemaTarget(part, schemas) {
  return typeof part?.$ref === 'string' ? schemas[part.$ref.split('/').at(-1)] : part;
}

function propertiesOf(schema, schemas) {
  const queue = [schema];
  const seen = new Set();
  const visited = [];
  for (const current of queue) {
    if (isObject(current) && !seen.has(current)) {
      seen.add(current);
      visited.push(current);
      appendAll(
        queue,
        [current.allOf ?? []].flat().map((part) => schemaTarget(part, schemas)),
      );
    }
  }
  return Object.assign(
    {},
    ...visited.reverse().map((entry) => (isObject(entry.properties) ? entry.properties : {})),
  );
}

function boundsOf(property) {
  const range = typeof property.pattern === 'string' ? patternLength(property.pattern) : undefined;
  return combineBounds([
    { max: property.maxLength, min: property.minLength, maximum: property.maximum },
    { max: range?.max, min: range?.min },
  ]);
}

function declaresKey(line, name) {
  return line.split(':')[0].replaceAll(/["']/gu, '').trim() === name;
}

function lineOfProperty(text, schema, property) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => declaresKey(line, schema));
  const found = lines.findIndex((line, index) => index > start && declaresKey(line, property));
  return (found === -1 ? Math.max(start, 0) : found) + 1;
}

export function specFacts(file, text, parseYaml) {
  const document = parsedConfig(file, text, parseYaml);
  if (!isObject(document)) {
    return [];
  }
  const schemas = document.components?.schemas ?? document.definitions ?? {};
  const named = isObject(schemas) ? Object.entries(schemas) : [];
  const root =
    typeof document.title === 'string' && document.properties ? [[document.title, document]] : [];
  return [...named, ...root].flatMap(([schema, definition]) =>
    Object.entries(propertiesOf(definition, isObject(schemas) ? schemas : {})).flatMap(
      ([property, details]) =>
        isObject(details) && ['string', 'integer', 'number'].includes(details.type)
          ? [
              makeFact({
                kind: 'spec',
                entityNames: [schema],
                fieldNames: [property],
                label: `${schema}.${property}`,
                file,
                line: lineOfProperty(text, schema, property),
                style: 'spec',
                bounds: boundsOf(details),
              }),
            ]
          : [],
    ),
  );
}
