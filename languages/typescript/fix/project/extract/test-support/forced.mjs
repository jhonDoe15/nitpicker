import { declineNote } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { withProject } from '../../model/project-model.mjs';
import { partialExtraction } from '../partial/extraction.mjs';

const FILE = 'src/a.ts';
const FINDING = { tool: 'structure', rule: 'near-duplicate', path: FILE, line: 1 };

export function spansOf(source, firstText, lastText) {
  const lines = source.split('\n');
  const [starts, ends] = [firstText, lastText].map((text) =>
    lines.flatMap((line, index) => (line.includes(text) ? [index + 1] : [])),
  );
  return [
    { start: starts[0], end: ends[0] },
    { start: starts.at(-1), end: ends.at(-1) },
  ];
}

function outcomeOf(result) {
  if (result.edits === undefined) {
    return { fixes: [], notes: [declineNote(FINDING, result.declined)] };
  }
  return { fixes: [{ finding: FINDING, edits: result.edits }], notes: [] };
}

export function forcedPartialRecipe({ runs, engineHoles = 0 }) {
  return {
    id: 'forced-partial-run',
    rules: [{ tool: 'structure', rule: 'near-duplicate' }],
    presets: ['typescript'],
    scope: 'project',
    safety: 'safe',
    plan(context) {
      return withProject(context, (project) => {
        const sourceFile = project.sourceFile(FILE);
        const units = sourceFile.statements.filter((node) => ts.isFunctionDeclaration(node));
        const env = {
          project,
          context,
          sourceFile,
          path: FILE,
          checker: project.program.getTypeChecker(),
          claimed: new Set(),
        };
        return outcomeOf(partialExtraction({ units, runs, label: 'forced', engineHoles }, env));
      });
    },
  };
}
