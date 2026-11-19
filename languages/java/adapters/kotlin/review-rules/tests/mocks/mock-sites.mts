import { lastSegment } from '../../../scan/typed/last-segment.mts';

type MockAnnotation = { name: string; realMethods: boolean; relaxed: boolean };

type AnnotatedProperty = {
  offset: number;
  annotations: MockAnnotation[];
  name: string;
  type: string | undefined;
};

export type MockSite = {
  offset: number;
  name?: string | undefined;
  type: string;
  spy: boolean;
  relaxed: boolean;
  local: boolean;
};

import { groupOf } from '../typed/indexing.mts';
import { braceDepths, closingIndex, splitArguments } from '../../../scan/kotlin-brackets.mts';

const NAMED_SUBJECT = /^(.+?)(?:Tests|Test|IT|Spec)$/u;
const CLASS_HEADER = /\bclass\s+([A-Za-z_]\w*)/gu;
const MOCK_ANNOTATIONS = new Set([
  'Mock',
  'MockK',
  'RelaxedMockK',
  'MockBean',
  'MockitoBean',
  'MockkBean',
]);
const SPY_ANNOTATIONS = new Set(['Spy', 'SpyK', 'SpyBean', 'MockitoSpyBean', 'SpykBean']);
const INJECT_ANNOTATIONS = new Set(['InjectMocks', 'InjectMockKs']);
const ANNOTATED_PROPERTY = new RegExp(
  [
    String.raw`((?:@(?:\w+:)?[\w.]+(?:\([^()]*\))?\s+)+)`,
    String.raw`(?:(?:private|protected|internal|public|lateinit|override|open|final)\s+)*`,
    String.raw`(?:val|var)\s+(\w+)\s*(?::\s*([\w.]+)|=\s*([A-Z][\w.]*)(?:\s*<[^()]*>)?\s*\()`,
  ].join(''),
  'gu',
);
const ANNOTATION = /@(?:\w+:)?([\w.]+)(\([^()]*\))?/gu;
const CREATION = new RegExp(
  [
    String.raw`(?<![\w.]|\bfun\s+)(?:(?:Mockito|io\.mockk)\s*\.\s*)?(mockkClass|mockk|mock|spyk|spy)`,
    String.raw`(?:\s*<\s*([\w.]+)(?:<(?:[^<>]|<[^<>]*>)*>)?(?:[^\w.<>][^<>]*)?>)?\s*[({]`,
  ].join(''),
  'gu',
);
const CLASS_LITERAL = /^([\w.]+)::class(?:\.java)?$/u;
const CONSTRUCTOR_CALL = /^([A-Z][\w.]*)(?:\s*<[^()]*>)?\s*\(/u;
const IDENTIFIER = /^[a-z_]\w*$/u;
const BINDING =
  /(?:(?:val|var)\s+(\w+)(?:\s*:\s*([\w.]+)(?:<(?:[^<>=]|<[^<>=]*>)*>)?\??)?|(?:this\s*\.\s*)?(\w+))\s*=\s*$/u;
const BINDING_WINDOW = 200;
const NAMED_ARGUMENT = /^\s*\w+\s*=(?!=)/u;
const REAL_METHODS = /\bCALLS_REAL_METHODS\b/u;
const RELAXED = /^\s*relaxed\s*=\s*true\s*$/u;
const RELAXED_ANNOTATIONS = new Set(['RelaxedMockK']);
const BACKTICK = '`';
const SPY_CALLS = new Set(['spyk', 'spy']);

function simpleName(type: string | undefined): string | undefined {
  return type === undefined ? undefined : lastSegment(type);
}

function splitText(text: string | undefined): string[] {
  return text === undefined ? [] : text.slice(1, -1).split(',');
}

function annotationsOf(text: string): MockAnnotation[] {
  return [...text.matchAll(ANNOTATION)].map((match) => {
    const name = simpleName(match[1]) ?? '';
    return {
      name,
      realMethods: REAL_METHODS.test(match[2] ?? ''),
      relaxed:
        RELAXED_ANNOTATIONS.has(name) || splitText(match[2]).some((part) => RELAXED.test(part)),
    };
  });
}

function annotatedProperties(code: string): AnnotatedProperty[] {
  return [...code.matchAll(ANNOTATED_PROPERTY)].map((match) => ({
    offset: match.index,
    annotations: annotationsOf(groupOf(match, 1)),
    name: groupOf(match, 2),
    type: simpleName(match[3] ?? match[4]),
  }));
}

export function subjectsOf(code: string): Set<string | undefined> {
  const injected: (string | undefined)[] = annotatedProperties(code)
    .filter(({ annotations }) => annotations.some(({ name }) => INJECT_ANNOTATIONS.has(name)))
    .map(({ type }) => type);
  if (injected.length > 0) {
    return new Set(injected);
  }
  const depths = braceDepths(code);
  return new Set(
    [...code.matchAll(CLASS_HEADER)]
      .filter((match) => depths[match.index] === 0)
      .map((match) => NAMED_SUBJECT.exec(groupOf(match, 1))?.[1])
      .filter((name) => name !== undefined),
  );
}

function declaredTypes(code: string): Map<string, string | undefined> {
  const types = new Map<string, string | undefined>();
  for (const match of code.matchAll(/\b(?:val|var)\s+(\w+)\s*:\s*([\w.]+)/gu)) {
    types.set(groupOf(match, 1), simpleName(match[2]));
  }
  return types;
}

function argumentType(text: string, types: Map<string, string | undefined>): string | undefined {
  const trimmed = text.replace(NAMED_ARGUMENT, '').trim();
  const literal = CLASS_LITERAL.exec(trimmed) ?? CONSTRUCTOR_CALL.exec(trimmed);
  if (literal !== null) {
    return simpleName(literal[1]);
  }
  return IDENTIFIER.test(trimmed) ? types.get(trimmed) : undefined;
}

function creationSite(
  code: string,
  match: RegExpExecArray,
  types: Map<string, string | undefined>,
): MockSite | undefined {
  const open = match.index + match[0].length - 1;
  const texts =
    code[open] === '('
      ? splitArguments(code, open).parts.map(({ start, end }) => code.slice(start, end))
      : [];
  const binding = BINDING.exec(code.slice(Math.max(0, match.index - BINDING_WINDOW), match.index));
  const name = binding?.[1] ?? binding?.[3];
  const type =
    simpleName(match[2]) ??
    texts.map((text) => argumentType(text, types)).find(Boolean) ??
    simpleName(binding?.[2]) ??
    (name === undefined ? undefined : types.get(name));
  if (texts.some((text) => REAL_METHODS.test(text)) || type === undefined) {
    return undefined;
  }
  return {
    offset: match.index,
    name,
    type,
    spy: SPY_CALLS.has(groupOf(match, 1)),
    relaxed: texts.some((text) => RELAXED.test(text)),
    local: binding?.[1] !== undefined,
  };
}

export function mockSites(code: string): MockSite[] {
  const types = declaredTypes(code);
  const annotated = annotatedProperties(code).flatMap((property) => {
    const mock = property.annotations.find(({ name }) => MOCK_ANNOTATIONS.has(name));
    const spy = property.annotations.some(({ name }) => SPY_ANNOTATIONS.has(name));
    if ((mock === undefined && !spy) || mock?.realMethods === true) {
      return [];
    }
    const { type } = property;
    return type === undefined
      ? []
      : [{ ...property, type, spy, relaxed: mock?.relaxed === true, local: false }];
  });
  const created = [...code.matchAll(CREATION)].flatMap((match) => {
    const site = creationSite(code, match, types);
    return site === undefined ? [] : [site];
  });
  return [...annotated, ...created];
}

function escapeRegExp(name: string): string {
  return name.replaceAll('$', String.raw`\$`);
}

export function scopeOf(code: string, offset: number): string {
  const depths = braceDepths(code);
  const depth = depths[offset] ?? 0;
  if (depth <= 1) {
    return code;
  }
  const open = Array.from(code.slice(0, offset)).findLastIndex(
    (character, index) => character === '{' && depths[index] === depth - 1,
  );
  return open < 0 ? code : code.slice(open, closingIndex(code, open) + 1);
}

export function isStubbed(code: string, name: string): boolean {
  const target = escapeRegExp(name);
  return new RegExp(
    [
      String.raw`\b(?:every|coEvery|justRun|coJustRun)\s*\{\s*(?:this\s*\.\s*)?${target}\s*\.`,
      String.raw`(?:\bwhenever|${BACKTICK}when${BACKTICK}|\bgiven)\s*\(\s*(?:this\s*\.\s*)?${target}\s*[.)]`,
      String.raw`\b${target}\s*\.\s*stub\s*\{`,
    ].join('|'),
    'u',
  ).test(code);
}
