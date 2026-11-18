const MAIN = 'src/main/java/demo';

const HUNK_GAP = 6;

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

function sourceOf(options: Options, side: 0 | 1): { text: string; changed: number[] } {
  const { name, imports = [], importsAfter = imports, members = [], parameters = '' } = options;
  const { statements = [] } = options;
  const lines: string[] = [
    'package demo;',
    '',
    ...importBlock(side === 0 ? imports : importsAfter),
  ];
  const changed: number[] = [];
  const add = (shape: Shape, indent: string): void => {
    const [before, after = before] = shape;
    if (before !== after) {
      const was = before.split('\n');
      const now = after.split('\n');
      changed.push(lines.length + 1 + was.findIndex((line, index) => line !== now[index]));
    }
    lines.push(...indented(side === 0 ? before : after, indent));
  };
  lines.push(`public class ${name}${options.typeParameters ?? ''} {`);
  members.forEach((member) => {
    add(member, '  ');
  });
  if (statements.length > 0) {
    lines.push(`  void shapes(${parameters}) {`);
    statements.forEach((statement) => {
      add(statement, '    ');
    });
    lines.push('  }');
  }
  lines.push('}', '');
  return { text: lines.join('\n'), changed };
}

function groupStarts(changed: readonly number[]): number[] {
  return changed.filter(
    (line, index) => index === 0 || line - (changed[index - 1] ?? 0) > HUNK_GAP,
  );
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
