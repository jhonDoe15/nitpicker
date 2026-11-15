import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import type {
  FixContext,
  Planned,
  ProjectFinding,
  ProjectPlan,
  ProjectRecipe,
  ReplaceEdit,
} from '../../typed/project-types.mts';
import { withProject } from '../../typed/project-views.mts';
import { partialExtraction } from '../partial/extraction.mts';
import { extractEnv } from '../typed/extract-types.mts';
import { declineNote } from '../typed/typed-views.mts';

type Span = { start: number; end: number };

const ts = typescriptApi();

const FILE = 'src/a.ts';
const FINDING: ProjectFinding = { tool: 'structure', rule: 'near-duplicate', path: FILE, line: 1 };

function linesWith(lines: string[], text: string): number[] {
  return lines.flatMap((line, index) => (line.includes(text) ? [index + 1] : []));
}

export function spansOf(source: string, firstText: string, lastText: string): [Span, Span] {
  const lines = source.split('\n');
  const starts = linesWith(lines, firstText);
  const ends = linesWith(lines, lastText);
  return [
    { start: starts[0] ?? 0, end: ends[0] ?? 0 },
    { start: starts.at(-1) ?? 0, end: ends.at(-1) ?? 0 },
  ];
}

function outcomeOf(result: Planned<ReplaceEdit>): ProjectPlan {
  if (result.edits === undefined) {
    return { fixes: [], notes: [declineNote(FINDING, result.declined)] };
  }
  return { fixes: [{ finding: FINDING, edits: result.edits }], notes: [] };
}

export function forcedPartialRecipe({
  runs,
  engineHoles = 0,
}: {
  runs: [Span, Span];
  engineHoles?: number;
}): ProjectRecipe {
  return {
    id: 'forced-partial-run',
    rules: [{ tool: 'structure', rule: 'near-duplicate' }],
    presets: ['typescript'],
    scope: 'project',
    safety: 'safe',
    plan(context: FixContext) {
      return withProject(context, (project) => {
        const sourceFile = project.sourceFile(FILE);
        if (sourceFile === undefined) {
          throw new TypeError(`${FILE} is not in the project`);
        }
        const [first, second] = sourceFile.statements.filter((node) =>
          ts.isFunctionDeclaration(node),
        );
        if (first === undefined || second === undefined) {
          throw new TypeError('The forced recipe needs two functions');
        }
        const units: [TypeScript.FunctionDeclaration, TypeScript.FunctionDeclaration] = [
          first,
          second,
        ];
        const env = extractEnv({
          project,
          context,
          sourceFile,
          path: FILE,
          checker: project.program.getTypeChecker(),
        });
        return outcomeOf(partialExtraction({ units, runs, label: 'forced', engineHoles }, env));
      });
    },
  };
}
