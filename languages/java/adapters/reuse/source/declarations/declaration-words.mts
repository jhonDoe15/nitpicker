const CLASS = 'class';
export const INTERFACE = 'interface';
export const JAVA_MODIFIERS: ReadonlySet<string> = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'native',
  'synchronized',
  'transient',
  'volatile',
  'strictfp',
  'default',
  'sealed',
  'non',
  '-',
]);
export const JAVA_TYPES: ReadonlyMap<string, string> = new Map([
  [CLASS, CLASS],
  ['record', CLASS],
  ['enum', 'enum'],
  [INTERFACE, INTERFACE],
]);
export const KOTLIN_TYPES: ReadonlyMap<string, string> = new Map([
  [CLASS, CLASS],
  ['object', CLASS],
  [INTERFACE, INTERFACE],
  ['typealias', 'type'],
]);
export const NAME_PARTS: ReadonlySet<string> = new Set(['identifier']);
export const BODY_OPENERS: ReadonlySet<string> = new Set(['{']);
export const ASSIGNMENT: ReadonlySet<string> = new Set(['=']);
export const ANGLE_DEPTH: ReadonlyMap<string, number> = new Map([
  ['<', 1],
  ['>', -1],
]);
export const JAVA_MEMBER_MARKS: ReadonlySet<string> = new Set(['(', '=', ';', '{']);
export const PROPERTY_MARKS: ReadonlySet<string> = new Set([':', '=', 'by', 'get']);
export const FUNCTION_MARKS: ReadonlySet<string> = new Set(['(', '{', '=']);
export const TYPE_MODIFIERS = ['enum', 'annotation'];
export const TYPE_MODIFIER_KINDS: ReadonlyMap<string, string> = new Map([
  ['enum', 'enum'],
  ['annotation', 'type'],
]);
export const LITERAL_WORDS: ReadonlySet<string> = new Set(['true', 'false', 'null']);
export const LITERAL_OPERATORS: ReadonlySet<string> = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '(',
  ')',
  '!',
  '~',
  '<<',
  '&',
  '|',
  '^',
]);
