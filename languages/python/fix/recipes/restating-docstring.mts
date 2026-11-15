import {
  isCovered as untypedIsCovered,
  restatesItsName as untypedRestatesItsName,
} from '../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';
import type {
  DocComment,
  FileRecipe,
  PlanContext,
  Planned,
  RecipeInputs,
  ReplaceEdit,
} from '../typed/fix-types.mts';

const isCovered: (inputs: RecipeInputs, name: string) => boolean = untypedIsCovered;
const restatesItsName: (comment: DocComment) => boolean = untypedRestatesItsName;

const STRING_STATEMENT = new RegExp(
  '^[rRuUbB]{0,2}(?:' +
    String.raw`"""(?:[^"\\]|\\[\s\S]|"(?!""))*"""` +
    String.raw`|'''(?:[^'\\]|\\[\s\S]|'(?!''))*'''` +
    String.raw`|"(?:[^"\\]|\\[\s\S])*"` +
    String.raw`|'(?:[^'\\]|\\[\s\S])*'` +
    ')$',
  'u',
);

const RULE = { tool: 'facts', rule: 'doc-comment-content' };

function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (const match of text.matchAll(/\n/gu)) {
    offsets.push(match.index + 1);
  }
  return offsets;
}

function docstringEdit(
  text: string,
  offsets: number[],
  { span, only }: DocComment,
): Omit<ReplaceEdit, 'path'> | undefined {
  const start = offsets[span[0] - 1] ?? 0;
  const end = offsets[span[1]] ?? text.length;
  const lines = text.slice(start, end);
  if (!STRING_STATEMENT.test(lines.trim())) {
    return undefined;
  }
  const replacement = only
    ? `${/^[ \t]*/u.exec(lines)?.[0] ?? ''}pass${/\r?\n$/u.exec(lines)?.[0] ?? ''}`
    : '';
  return { type: 'replace', start, end, text: replacement };
}

export const pythonRestatingDocstringRecipe: FileRecipe = {
  id: 'python-restating-docstring',
  rules: [RULE],
  presets: ['python'],
  scope: 'file',
  safety: 'review',
  plan({ files, inputs }: PlanContext): Planned {
    const comments = inputs.pythonDocstrings ?? {};
    return {
      fixes: files
        .filter(({ path: name }) => isCovered(inputs, name))
        .flatMap(({ path: name, text }) => {
          const offsets = lineOffsets(text);
          return (comments[name] ?? [])
            .filter((comment) => restatesItsName(comment))
            .flatMap((comment) => {
              const edit = docstringEdit(text, offsets, comment);
              return edit === undefined
                ? []
                : [
                    {
                      finding: { ...RULE, path: name, line: comment.line },
                      edits: [{ ...edit, path: name }],
                    },
                  ];
            });
        }),
    };
  },
};
