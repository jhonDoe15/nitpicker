import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import type { Finding, StructureFunction } from './typed/structure-types.mts';

const BODY_LINE = 5;

export function fn(
  name: string,
  parameters: number,
  { complexity = 1, file = 'src/demo/a.py' }: { complexity?: number; file?: string } = {},
): StructureFunction {
  return {
    file,
    name,
    start: 4,
    definition: 4,
    bodyStart: 5,
    end: 5,
    lines: 2,
    statements: 1,
    maxControlNesting: 0,
    parameters,
    complexity,
  };
}

export function coverageOf(...names: readonly string[]): string {
  return JSON.stringify({
    files: {
      'src/demo/a.py': {
        functions: Object.fromEntries(
          names.map((name) => [
            name,
            {
              executed_lines: [],
              missing_lines: [BODY_LINE],
              summary: {
                num_statements: 1,
                covered_lines: 0,
                num_branches: 0,
                covered_branches: 0,
              },
            },
          ]),
        ),
      },
    },
  });
}

function isFinding(value: unknown): value is Finding {
  return typeof fieldOf(value, 'tool') === 'string' && typeof fieldOf(value, 'rule') === 'string';
}

export function enforceable(result: { json: (name: string) => unknown }): Finding[] {
  return listOf(result.json('new-findings.json'))
    .filter(isFinding)
    .filter(({ classification }: Finding) => classification === 'enforceable')
    .map(({ tool, rule, symbol, message }: Finding) => ({ tool, rule, symbol, message }));
}
