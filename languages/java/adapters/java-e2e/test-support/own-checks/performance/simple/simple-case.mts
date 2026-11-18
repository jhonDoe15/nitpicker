const MAIN = 'src/main/java/demo';

const HUNK_GAP = 4;

type Span = readonly [first: number, last: number];

export type Shape = readonly [before: string, after?: string];

export type SimpleCase = {
  readonly check: string;
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly lines: readonly number[];
};

type Options = {
  readonly check: string;
  readonly name: string;
  readonly typeParameters?: string;
  readonly imports?: readonly string[];
  readonly importsAfter?: readonly string[];
  readonly members?: readonly Shape[];
  readonly parameters?: string;
  readonly statements?: readonly Shape[];
};

function indented(text: string, indent: string): string[] {
  return text.split('\n').map((line) => (line === '' ? line : `${indent}${line}`));
}

function importBlock(imports: readonly string[]): string[] {
  return imports.length === 0 ? [] : [...imports.map((name) => `import ${name};`), ''];
}

type Builder = {
  readonly lines: string[];
  readonly changed: Span[];
  readonly side: 0 | 1;
};

function addShape(builder: Builder, shape: Shape, indent: string): void {
  const { lines, changed, side } = builder;
  const [before, after = before] = shape;
  if (before !== after) {
    const was = before.split('\n');
    const now = after.split('\n');
    const prefix = was.findIndex((line, index) => line !== now[index]);
    const room = Math.min(was.length, now.length) - prefix;
    const suffix = [...was.keys()].findIndex(
      (offset) => offset >= room || was.at(-1 - offset) !== now.at(-1 - offset),
    );
    changed.push([
      lines.length + 1 + prefix,
      lines.length + Math.max(was.length - suffix, prefix + 1),
    ]);
  }
  for (const line of indented(side === 0 ? before : after, indent)) {
    lines.push(line);
  }
}

function sourceOf(options: Options, side: 0 | 1): { text: string; changed: Span[] } {
  const { name, imports = [], importsAfter = imports, members = [], parameters = '' } = options;
  const { statements = [] } = options;
  const lines: string[] = [
    'package demo;',
    '',
    ...importBlock(side === 0 ? imports : importsAfter),
  ];
  const builder: Builder = { lines, changed: [], side };
  lines.push(`public class ${name}${options.typeParameters ?? ''} {`);
  for (const member of members) {
    addShape(builder, member, '  ');
  }
  if (statements.length > 0) {
    lines.push(`  void shapes(${parameters}) {`);
    for (const statement of statements) {
      addShape(builder, statement, '    ');
    }
    lines.push('  }');
  }
  lines.push('}', '');
  return { text: lines.join('\n'), changed: builder.changed };
}

function groupStarts(changed: readonly Span[]): number[] {
  return changed
    .filter(
      ([first], index) => index === 0 || first - (changed[index - 1]?.[1] ?? 0) - 1 > HUNK_GAP,
    )
    .map(([first]) => first);
}

export function simpleCase(options: Options): SimpleCase {
  const before = sourceOf(options, 0);
  const after = sourceOf(options, 1);
  return {
    check: options.check,
    file: `${MAIN}/${options.name}.java`,
    before: before.text,
    after: after.text,
    lines: groupStarts(before.changed),
  };
}
