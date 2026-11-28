import {
  escapeRegExp as untypedEscapeRegExp,
  globToRegExpSource,
} from '../../../../../shared/paths/glob.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const PATH = '[^*?{}[\\]\\\\]+';
const SEGMENT = '[^*?{}[\\]\\\\/]+';
const SHAPES: readonly (readonly [RegExp, (alternatives: string) => string])[] = [
  [new RegExp(`^(?<part>${PATH})/\\*\\*$`, 'u'), (folders) => `^(?:${folders})/`],
  [new RegExp(`^\\*\\*/(?<part>${SEGMENT})/\\*\\*$`, 'u'), (names) => `(?:^|/)(?:${names})/`],
  [new RegExp(`^\\*\\*/\\*(?<part>${SEGMENT})$`, 'u'), (endings) => `(?:^|/)[^/]*(?:${endings})$`],
  [new RegExp(`^\\*(?<part>${SEGMENT})$`, 'u'), (endings) => `^[^/]*(?:${endings})$`],
  [new RegExp(`^\\*\\*/(?<part>${SEGMENT})$`, 'u'), (names) => `(?:^|/)(?:${names})$`],
];

function shapeOf(glob: string): readonly [number, string] | undefined {
  for (const [index, [shape]] of SHAPES.entries()) {
    const part = shape.exec(glob)?.groups?.['part'];
    if (part !== undefined) {
      return [index, escapeRegExp(part)];
    }
  }
  return undefined;
}

export function excludePatternOf(globs: readonly string[]): string | undefined {
  const grouped = SHAPES.map(([, folded]) => ({ folded, alternatives: new Array<string>() }));
  const others: string[] = [];
  for (const glob of globs) {
    const shape = shapeOf(glob);
    if (shape === undefined) {
      others.push(globToRegExpSource(glob));
    } else {
      grouped[shape[0]]?.alternatives.push(shape[1]);
    }
  }
  const parts = [
    ...grouped.flatMap(({ folded, alternatives }) =>
      alternatives.length === 0 ? [] : [folded(alternatives.join('|'))],
    ),
    ...others,
  ];
  return parts.length === 0 ? undefined : parts.join('|');
}
