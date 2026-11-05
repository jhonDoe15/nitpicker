import { braceDepths, splitArguments } from '../../../scan/kotlin-brackets.mjs';

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
    String.raw`((?:@[\w.]+(?:\([^()]*\))?\s+)+)`,
    String.raw`(?:(?:private|protected|internal|public|lateinit|override|open|final)\s+)*`,
    String.raw`(?:val|var)\s+(\w+)\s*(?::\s*([\w.]+)|=\s*([A-Z][\w.]*)\s*(?:<[^()]*>)?\s*\()`,
  ].join(''),
  'gu',
);
const ANNOTATION = /@([\w.]+)(\([^()]*\))?/gu;
const CREATION =
  /(?<![\w.]|\bfun\s+)(?:Mockito\s*\.\s*)?(mockk|mock|spyk|spy)\s*(?:<\s*([\w.]+)[^<>]*>)?\s*\(/gu;
const CLASS_LITERAL = /^([\w.]+)::class(?:\.java)?$/u;
const CONSTRUCTOR_CALL = /^([A-Z][\w.]*)\s*(?:<[^()]*>)?\s*\(/u;
const IDENTIFIER = /^[a-z_]\w*$/u;
const BINDING = /(?:(?:val|var)\s+(\w+)\s*(?::\s*([\w.]+)\??)?|(?:this\s*\.\s*)?(\w+))\s*=\s*$/u;
const REAL_METHODS = /\bCALLS_REAL_METHODS\b/u;
const BACKTICK = '`';
const SPY_CALLS = new Set(['spyk', 'spy']);

function simpleName(type) {
  return type?.split('.').at(-1);
}

function annotationsOf(text) {
  return [...text.matchAll(ANNOTATION)].map((match) => ({
    name: simpleName(match[1]),
    realMethods: REAL_METHODS.test(match[2] ?? ''),
  }));
}

function annotatedProperties(code) {
  return [...code.matchAll(ANNOTATED_PROPERTY)].map((match) => ({
    offset: match.index,
    annotations: annotationsOf(match[1]),
    name: match[2],
    type: simpleName(match[3] ?? match[4]),
  }));
}

export function subjectsOf(code) {
  const injected = annotatedProperties(code)
    .filter(({ annotations }) => annotations.some(({ name }) => INJECT_ANNOTATIONS.has(name)))
    .map(({ type }) => type);
  if (injected.length > 0) {
    return new Set(injected);
  }
  const depths = braceDepths(code);
  return new Set(
    [...code.matchAll(CLASS_HEADER)]
      .filter((match) => depths[match.index] === 0)
      .map((match) => NAMED_SUBJECT.exec(match[1])?.[1])
      .filter((name) => name !== undefined),
  );
}

function declaredTypes(code) {
  const types = new Map();
  for (const match of code.matchAll(/\b(?:val|var)\s+(\w+)\s*:\s*([\w.]+)/gu)) {
    types.set(match[1], simpleName(match[2]));
  }
  return types;
}

function argumentType(text, types) {
  const trimmed = text.trim();
  const literal = CLASS_LITERAL.exec(trimmed) ?? CONSTRUCTOR_CALL.exec(trimmed);
  if (literal !== null) {
    return simpleName(literal[1]);
  }
  return IDENTIFIER.test(trimmed) ? types.get(trimmed) : undefined;
}

function creationSite(code, match, types) {
  const open = match.index + match[0].length - 1;
  const texts = splitArguments(code, open).parts.map(({ start, end }) => code.slice(start, end));
  const binding = BINDING.exec(code.slice(Math.max(0, match.index - 200), match.index));
  const name = binding?.[1] ?? binding?.[3];
  const type =
    simpleName(match[2]) ??
    (texts.length > 0 ? argumentType(texts[0], types) : undefined) ??
    simpleName(binding?.[2]) ??
    types.get(name);
  const spy = SPY_CALLS.has(match[1]) || texts.some((text) => REAL_METHODS.test(text));
  return { offset: match.index, name, type, spy };
}

export function mockSites(code) {
  const types = declaredTypes(code);
  const annotated = annotatedProperties(code).flatMap((property) => {
    const mock = property.annotations.find(({ name }) => MOCK_ANNOTATIONS.has(name));
    const spy = property.annotations.some(({ name }) => SPY_ANNOTATIONS.has(name));
    if (mock === undefined && !spy) {
      return [];
    }
    return [{ ...property, spy: spy || mock.realMethods }];
  });
  const created = [...code.matchAll(CREATION)].map((match) => creationSite(code, match, types));
  return [...annotated, ...created].filter(({ type }) => type !== undefined);
}

function escaped(name) {
  return name.replaceAll('$', String.raw`\$`);
}

export function isStubbed(code, name) {
  const target = escaped(name);
  return new RegExp(
    [
      String.raw`\b(?:every|coEvery|justRun|coJustRun)\s*\{\s*(?:this\s*\.\s*)?${target}\s*\.`,
      String.raw`(?:\bwhenever|${BACKTICK}when${BACKTICK}|\bgiven)\s*\(\s*(?:this\s*\.\s*)?${target}\s*[.)]`,
      String.raw`\b${target}\s*\.\s*stub\s*\{`,
    ].join('|'),
    'u',
  ).test(code);
}
