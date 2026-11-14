import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { declaresCheckable as untypedDeclaresCheckable } from './candidates.mjs';

const declaresCheckable: (sourceFile: ts.SourceFile, react: boolean) => boolean =
  untypedDeclaresCheckable;

function checkable(fileName: string, text: string, react = true): boolean {
  return declaresCheckable(ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest), react);
}

describe('the syntax pre-pass', () => {
  it('finds a component with props only in a .tsx file of a React project', () => {
    const card =
      'export const Card = memo(function Card(props: { a?: number }) { return null; });\n';

    expect([
      checkable('card.tsx', card),
      checkable('card.tsx', card, false),
      checkable('card.ts', card),
      checkable('card.tsx', 'export function Card() { return null; }\n'),
    ]).toEqual([true, false, false, false]);
  });

  it('finds a function with an options parameter', () => {
    expect([
      checkable(
        'run.ts',
        'export function run(task: string, options: { a?: number }) { return task; }\n',
      ),
      checkable(
        'run.ts',
        'export default function ({ left }: { left?: number }) { return left; }\n',
      ),
      checkable('run.ts', 'export const run = (config: RunConfig) => config;\n'),
      checkable('run.ts', 'export const sum = (a: number, b: number) => a + b;\n'),
    ]).toEqual([true, true, true, false]);
  });
});
