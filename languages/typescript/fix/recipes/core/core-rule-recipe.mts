import { TSESLint, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { SAFE as untypedSafe } from '../../../../../core/fix/engine/safety.mjs';
import { isNode } from '../../../preset/eslint-plugin/rules/typed/node-views.mts';

export type CoreEdit = { readonly start: number; readonly end: number; readonly text: string };
export type CorePlan = { readonly edits: readonly CoreEdit[] } | { readonly declined: string };
type SourceCode = TSESLint.SourceCode;

export type CoreRequest = {
  readonly name: string;
  readonly text: string;
  readonly sourceCode: SourceCode;
  readonly node: TSESTree.Node;
  readonly range: { readonly start: number; readonly end: number };
};

type File = { readonly path: string; readonly text: string };
type Inputs = { readonly isExcepted?: (ruleId: string, name: string) => boolean };
type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};
type Fix = {
  readonly finding: Finding;
  readonly edits: readonly (CoreEdit & { readonly type: string; readonly path: string })[];
};

type CoreRecipe = {
  readonly id: string;
  readonly rule: string;
  readonly safety?: string;
  readonly options?: readonly unknown[];
  readonly presets?: readonly string[];
  readonly plan: (request: CoreRequest) => CorePlan;
};

const SAFE: string = untypedSafe;
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

function lint(name: string, text: string, { rule, options = [] }: CoreRecipe) {
  const linter = new TSESLint.Linter({ configType: 'flat' });
  const messages = linter.verify(
    text,
    [
      {
        files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
        languageOptions: {
          parser: tseslint.parser,
          sourceType: 'module',
          ecmaVersion: 'latest',
          parserOptions: { ecmaFeatures: { jsx: name.endsWith('x') } },
        },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        rules: { [rule]: ['error', ...options] },
      },
    ],
    { filename: name },
  );
  return {
    messages: messages.filter(({ ruleId }) => ruleId === rule),
    sourceCode: linter.getSourceCode(),
  };
}

function coveringNode(
  sourceCode: SourceCode,
  start: number,
  end: number,
): TSESTree.Node | undefined {
  let node: unknown = sourceCode.getNodeByRangeIndex(start);
  while (isNode(node)) {
    if (node.range[0] <= start && node.range[1] >= end) {
      return node;
    }
    node = node.parent;
  }
  return undefined;
}

function offset(sourceCode: SourceCode, line: number, column: number): number {
  return sourceCode.getIndexFromLoc({ line, column: column - 1 });
}

function fileFixes(recipe: CoreRecipe, { path: name, text }: File) {
  const { messages, sourceCode } = lint(name, text, recipe);
  const fixes: Fix[] = [];
  const notes: string[] = [];
  for (const message of messages) {
    const range =
      message.endLine === undefined || message.endColumn === undefined
        ? undefined
        : {
            start: offset(sourceCode, message.line, message.column),
            end: offset(sourceCode, message.endLine, message.endColumn),
          };
    const node = range === undefined ? undefined : coveringNode(sourceCode, range.start, range.end);
    const planned: CorePlan =
      node === undefined || range === undefined
        ? { declined: 'the reported code could not be parsed' }
        : recipe.plan({ name, text, sourceCode, node, range });
    if ('declined' in planned) {
      notes.push(
        `--fix left ${name}:${String(message.line)} eslint/${recipe.rule}: ${planned.declined}`,
      );
    } else {
      fixes.push({
        finding: { tool: 'eslint', rule: recipe.rule, path: name, line: message.line },
        edits: planned.edits.map((edit) => ({ type: 'replace', path: name, ...edit })),
      });
    }
  }
  return { fixes, notes };
}

export function coreRuleRecipe(recipe: CoreRecipe) {
  return {
    id: recipe.id,
    rules: [{ tool: 'eslint', rule: recipe.rule }],
    presets: recipe.presets ?? ['typescript', 'javascript'],
    scope: 'file',
    safety: recipe.safety ?? SAFE,
    plan({ files, inputs }: { readonly files: readonly File[]; readonly inputs: Inputs }) {
      const planned = files
        .filter(
          ({ path: name }) =>
            SOURCE_FILE.test(name) && inputs.isExcepted?.(recipe.rule, name) !== true,
        )
        .map((file) => fileFixes(recipe, file));
      return {
        fixes: planned.flatMap(({ fixes }) => fixes),
        notes: planned.flatMap(({ notes }) => notes),
      };
    },
  };
}
