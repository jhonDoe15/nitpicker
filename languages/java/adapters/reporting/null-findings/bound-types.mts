import {
  PARENTHESES as PARENTHESES_UNTYPED,
  balancedEnd as balancedEndUntyped,
} from '../../../../../shared/source-text/brackets/balanced.mjs';
import { classAt, type JavaClass } from '../source-facts/java-model.mts';
import type { SourceIndex } from '../source-facts/source-index.mts';

const PARENTHESES: readonly string[] = PARENTHESES_UNTYPED;
const balancedEnd: (text: string, open: number, brackets: readonly string[]) => number =
  balancedEndUntyped;
const ANNOTATION_LOOKAHEAD = 400;

const READ_CALL =
  /\b(?:fromJson|readValue|readValues|convertValue|treeToValue|readerFor|forType|getParameterized)\s*\(/gu;
const CLASS_LITERAL = /([\w$.]+)\s*\.\s*class\b/gu;
const TYPE_TOKEN =
  /\b(?:TypeToken|TypeReference|ParameterizedTypeReference)\s*<([^;(){}]*?)>\s*\(/gu;
const BINDING_NAMES = 'RequestBody|ModelAttribute|RequestPart';
const BINDING_ANNOTATION = String.raw`@\s*(?:\w+\s*\.\s*)*(?:${BINDING_NAMES})\b(?:\s*\([^)]*\))?`;
const PARAMETER_MODIFIERS = String.raw`\s*(?:(?:@[\w.]+(?:\([^)]*\))?|final)\s+)*`;
const PARAMETER_TYPE = String.raw`([\w$.]+(?:\s*<[^()]*?>)?)\s+[\w$]+\s*[,)]`;
const BINDING_PARAMETER = new RegExp(
  `${BINDING_ANNOTATION}${PARAMETER_MODIFIERS}${PARAMETER_TYPE}`,
  'gu',
);
const ACCESSOR = /^(?:get|set|is)[A-Z]\w*$/u;
const JSON_ANNOTATION = /@\s*(?:[a-z]\w*\s*\.\s*)*(?:Json[A-Z]\w*|SerializedName|Expose)\b/gu;
const ANNOTATED_CLASS =
  /^(?:\s*(?:@[\w.]+(?:\s*\([^)]*\))?|public|protected|private|static|final|abstract))*\s*(?:class|record)\s+([\w$]+)/u;
const CAPITALIZED = /\b[A-Z][\w$]*/gu;

function lastSegment(name: string): string {
  return name.split('.').at(-1) ?? name;
}

function literalsIn(text: string): string[] {
  return [...text.matchAll(CLASS_LITERAL)].map((match) => lastSegment(match[1] ?? ''));
}

function capitalized(text: string): string[] {
  return text.match(CAPITALIZED) ?? [];
}

function callArguments(clean: string, open: number): string {
  return clean.slice(open, balancedEnd(clean, open, PARENTHESES));
}

function annotatedTypes(clean: string, classes: readonly JavaClass[]): string[] {
  return [...clean.matchAll(JSON_ANNOTATION)].flatMap((match) => {
    const following = ANNOTATED_CLASS.exec(
      clean.slice(match.index + match[0].length, match.index + ANNOTATION_LOOKAHEAD),
    );
    const enclosing = classAt({ clean, classes }, match.index)?.name;
    return [following?.[1] ?? enclosing].filter((name) => name !== undefined);
  });
}

function directlyBound(clean: string, classes: readonly JavaClass[]): string[] {
  const reads = [...clean.matchAll(READ_CALL)].flatMap((match) =>
    literalsIn(callArguments(clean, match.index + match[0].length - 1)),
  );
  const tokens = [...clean.matchAll(TYPE_TOKEN)].flatMap((match) => capitalized(match[1] ?? ''));
  const parameters = [...clean.matchAll(BINDING_PARAMETER)].flatMap((match) =>
    capitalized(match[1] ?? ''),
  );
  return [...reads, ...tokens, ...parameters, ...annotatedTypes(clean, classes)];
}

export function classesByName(index: SourceIndex): Map<string, JavaClass[]> {
  const byName = new Map<string, JavaClass[]>();
  for (const file of index.files()) {
    for (const found of index.source(file)?.classes ?? []) {
      byName.set(found.name, [...(byName.get(found.name) ?? []), found]);
    }
  }
  return byName;
}

function isDataClass(found: JavaClass): boolean {
  return found.members.every(
    (member) => member.kind === 'field' || member.name === found.name || ACCESSOR.test(member.name),
  );
}

function related(found: JavaClass, known: ReadonlyMap<string, JavaClass[]>): string[] {
  const fieldTypes = found.members
    .filter((member) => member.kind === 'field')
    .flatMap((member) => capitalized(member.header))
    .filter((name) => known.get(name)?.every(isDataClass) === true);
  const parent = found.parent === undefined ? [] : [found.parent];
  return [...parent, ...fieldTypes].filter((name) => known.has(name));
}

export function boundTypes(
  index: SourceIndex,
  byName: ReadonlyMap<string, JavaClass[]>,
): Set<string> {
  const bound = new Set(
    index.files().flatMap((file) => {
      const source = index.source(file);
      return source === undefined ? [] : directlyBound(source.clean, source.classes);
    }),
  );
  for (const name of bound) {
    const others = (byName.get(name) ?? []).flatMap((found) => related(found, byName));
    for (const other of others) {
      bound.add(other);
    }
  }
  return bound;
}
