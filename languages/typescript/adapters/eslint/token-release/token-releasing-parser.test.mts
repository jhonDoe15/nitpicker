import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import ts from 'typescript';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  typedSourceFileOf,
  withTokenReleasingParsers,
  wrapTokenReleasingParser,
} from './token-releasing-parser.mts';

function cachedNodeChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): readonly ts.Node[] | undefined {
  const getter = fieldOf(ts, 'getNodeChildren');
  if (typeof getter !== 'function') {
    return undefined;
  }
  const value: unknown = Reflect.apply(getter, ts, [node, sourceFile]);
  return Array.isArray(value) ? value : undefined;
}

function parseWith(
  parser: object,
  code: string,
  options: Readonly<Record<string, unknown>>,
): unknown {
  const parse = fieldOf(parser, 'parseForESLint');
  if (typeof parse !== 'function') {
    throw new TypeError('Parser does not provide parseForESLint');
  }
  return Reflect.apply(parse, parser, [code, options]);
}

function sourceFileFrom(result: unknown): ts.SourceFile | undefined {
  const node = typedSourceFileOf(result);
  return node !== undefined && ts.isSourceFile(node as ts.Node)
    ? (node as ts.SourceFile)
    : undefined;
}

describe('token-releasing-parser', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-token-release-'));
  const fileOne = path.join(root, 'one.ts');
  const fileTwo = path.join(root, 'two.ts');
  const sourceOne = 'declare const sure: string;\nexport const redundant = sure as string;\n';
  const sourceTwo = 'declare const other: number;\nexport const value = other as number;\n';

  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
      include: ['*.ts'],
    }),
  );
  writeFileSync(fileOne, sourceOne);
  writeFileSync(fileTwo, sourceTwo);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('releases cached children of file 1 when file 2 is parsed and rebuilds on demand', () => {
    const parser = wrapTokenReleasingParser(tseslint.parser);
    const options = { project: './tsconfig.json', tsconfigRootDir: root };

    const first = parseWith(parser, sourceOne, { ...options, filePath: fileOne });
    const firstSourceFile = sourceFileFrom(first);
    expect(firstSourceFile).toBeDefined();
    if (firstSourceFile === undefined) {
      return;
    }
    const firstStatement = firstSourceFile.statements[0];
    expect(firstStatement).toBeDefined();
    if (firstStatement === undefined) {
      return;
    }

    const originalKinds = firstSourceFile.getChildren(firstSourceFile).map((child) => child.kind);
    expect(cachedNodeChildren(firstSourceFile, firstSourceFile)).toBeDefined();
    expect(cachedNodeChildren(firstStatement, firstSourceFile)).toBeDefined();

    const second = parseWith(parser, sourceTwo, { ...options, filePath: fileTwo });
    const secondSourceFile = sourceFileFrom(second);
    expect(secondSourceFile).toBeDefined();
    if (secondSourceFile === undefined) {
      return;
    }

    expect(cachedNodeChildren(firstSourceFile, firstSourceFile)).toBeUndefined();
    expect(cachedNodeChildren(firstStatement, firstSourceFile)).toBeUndefined();
    expect(cachedNodeChildren(secondSourceFile, secondSourceFile)).toBeDefined();

    const rebuiltKinds = firstSourceFile.getChildren(firstSourceFile).map((child) => child.kind);
    expect(rebuiltKinds).toEqual(originalKinds);
  });

  it('preserves parser identity across entries and produces identical typed ESLint findings', () => {
    const baseEntries = [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
        },
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: { '@typescript-eslint/no-unnecessary-type-assertion': 'error' as const },
      },
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
      },
    ];
    const wrappedEntries = withTokenReleasingParsers(baseEntries);
    expect(wrappedEntries[0]?.languageOptions.parser).toBe(
      wrappedEntries[1]?.languageOptions.parser,
    );

    const baselineLinter = new Linter({ cwd: root });
    const wrappedLinter = new Linter({ cwd: root });
    const baselineFindings = [
      baselineLinter.verify(sourceOne, baseEntries, fileOne),
      baselineLinter.verify(sourceTwo, baseEntries, fileTwo),
    ];
    const wrappedFindings = [
      wrappedLinter.verify(sourceOne, wrappedEntries, fileOne),
      wrappedLinter.verify(sourceTwo, wrappedEntries, fileTwo),
    ];

    expect(wrappedFindings).toEqual(baselineFindings);
    expect(wrappedFindings.map((messages) => messages.map((message) => message.ruleId))).toEqual([
      ['@typescript-eslint/no-unnecessary-type-assertion'],
      ['@typescript-eslint/no-unnecessary-type-assertion'],
    ]);
  });
});
