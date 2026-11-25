import { parsedConfig } from '../../schema/sources/sqlc-schemas.mts';
import { makeFact } from '../scanning/facts.mts';
import { patternLength } from '../scanning/pattern-length.mts';
import { combineBounds, number } from '../validators/bounds.mts';
import { fieldOf, isPlainObject, listOf } from '../../../values/readers.mts';
import type { ParseYaml } from '../../check-types.mts';
import type { CombinedBounds, Fact } from '../fact-types.mts';
import { appendAll } from '../../../lists/lists.mts';

const SPEC_FILE = /\.(?:ya?ml|json)$/iu;
const SPEC_MARKER = /["']?(?:openapi|swagger|\$schema)["']?\s*:/u;
const MARKER_WINDOW = 4000;

export function isSpecFile(file: string): boolean {
  return SPEC_FILE.test(file);
}

export function mightBeSpec(text: string): boolean {
  return SPEC_MARKER.test(text.slice(0, MARKER_WINDOW)) || text.includes('components:');
}

function schemaTarget(part: unknown, schemas: Readonly<Record<string, unknown>>): unknown {
  const reference = fieldOf(part, '$ref');
  return typeof reference === 'string' ? schemas[reference.split('/').at(-1) ?? ''] : part;
}

function propertiesOf(
  schema: unknown,
  schemas: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const queue: unknown[] = [schema];
  const seen = new Set<unknown>();
  const visited: Record<string, unknown>[] = [];
  for (const current of queue) {
    if (isPlainObject(current) && !seen.has(current)) {
      seen.add(current);
      visited.push(current);
      const allOf = current['allOf'] ?? [];
      const parts = Array.isArray(allOf) ? listOf(allOf) : [allOf];
      appendAll(
        queue,
        parts.map((part) => schemaTarget(part, schemas)),
      );
    }
  }
  return Object.fromEntries(
    visited.reverse().flatMap((entry) => {
      const properties = entry['properties'];
      return isPlainObject(properties) ? Object.entries(properties) : [];
    }),
  );
}

function boundsOf(property: Readonly<Record<string, unknown>>): CombinedBounds {
  const pattern = property['pattern'];
  const range = typeof pattern === 'string' ? patternLength(pattern) : undefined;
  return combineBounds([
    {
      max: number(property['maxLength']),
      min: number(property['minLength']),
      maximum: number(property['maximum']),
    },
    { max: range?.max, min: range?.min },
  ]);
}

function declaresKey(line: string, name: string): boolean {
  return (line.split(':')[0] ?? '').replaceAll(/["']/gu, '').trim() === name;
}

function lineOfProperty(text: string, schema: string, property: string): number {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => declaresKey(line, schema));
  const found = lines.findIndex((line, index) => index > start && declaresKey(line, property));
  return (found === -1 ? Math.max(start, 0) : found) + 1;
}

export function specFacts(file: string, text: string, parseYaml?: ParseYaml): Fact[] {
  const document = parsedConfig(file, text, parseYaml);
  if (!isPlainObject(document)) {
    return [];
  }
  const schemas =
    fieldOf(fieldOf(document, 'components'), 'schemas') ?? document['definitions'] ?? {};
  const named = isPlainObject(schemas) ? Object.entries(schemas) : [];
  const title = document['title'];
  const root: [string, unknown][] =
    typeof title === 'string' && document['properties'] ? [[title, document]] : [];
  return [...named, ...root].flatMap(([schema, definition]) =>
    Object.entries(propertiesOf(definition, isPlainObject(schemas) ? schemas : {})).flatMap(
      ([property, details]) => {
        const type = fieldOf(details, 'type');
        return isPlainObject(details) &&
          typeof type === 'string' &&
          ['string', 'integer', 'number'].includes(type)
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
          : [];
      },
    ),
  );
}
