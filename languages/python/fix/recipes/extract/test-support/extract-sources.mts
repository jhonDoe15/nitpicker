import { applyRecipes } from '../../../source/test-support/apply-recipes.mts';
import { PYTHON_RECIPES } from '../../python-recipes.mts';

export const PATH = 'src/align.py';
const RULE = 'structure/near-duplicate';

type Applied = ReturnType<typeof applyRecipes>;
type Extracted = {
  readonly after: string;
  readonly notes: Applied['outcome']['notes'];
  readonly fixed: Applied['outcome']['fixedFindings'];
  readonly errors: Applied['outcome']['toolErrors'];
};

export function extractAll(files: Readonly<Record<string, string>>): Applied {
  return applyRecipes(files, { selectedRules: [RULE], recipes: PYTHON_RECIPES });
}

export function extracted(text: string): Extracted {
  const { read, outcome } = extractAll({ [PATH]: text });
  return {
    after: read(PATH),
    notes: outcome.notes,
    fixed: outcome.fixedFindings,
    errors: outcome.toolErrors,
  };
}

export function note(line: number, reason: string, path = PATH): string {
  return `--fix left ${path}:${String(line)} near-duplicate: ${reason}`;
}

export function align(
  edge: string,
  key: string,
  options: { name?: string; body?: string } = {},
): string {
  const { name = `align_${edge}`, body } = options;
  return [
    `def ${name}(elements, state, translate):`,
    '    selected = [e for e in state.selection if not e.locked]',
    ...(body === undefined ? [] : [body]),
    `    label = translate("labels.${key}")`,
    `    return render(selected, icon="${edge}", label=label)`,
    '',
  ].join('\n');
}

export function module(...parts: readonly string[]): string {
  return parts.join('\n\n');
}

export function totals(name: string, scale: string, value: string, extra = ''): string {
  return [
    `    def ${name}(self, items, ${scale}):`,
    '        total = 0',
    '        for index in range(len(items)):',
    `            total = total + self.weigh(items[index], ${scale}) * ${value}`,
    ...(extra === '' ? [] : [extra]),
    '        self.record(total, items)',
    '        return total',
    '',
  ].join('\n');
}
