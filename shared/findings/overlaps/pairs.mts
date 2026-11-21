export type Overlap = {
  readonly primary: { readonly tool: string; readonly rule: string };
  readonly secondary: {
    readonly tool: string;
    readonly rule: string;
    readonly messageStartsWith?: string;
  };
};

const SILENT_CATCH = { tool: 'eslint-errors', rule: 'nitpicker/no-silent-catch' };
const LINT_TOOL = 'eslint-lint';
const CATCH_PARAMETER = 'Catch parameter';

export const CROSS_TOOL_OVERLAPS: readonly Overlap[] = [
  {
    primary: SILENT_CATCH,
    secondary: {
      tool: LINT_TOOL,
      rule: '@typescript-eslint/no-unused-vars',
      messageStartsWith: CATCH_PARAMETER,
    },
  },
  {
    primary: SILENT_CATCH,
    secondary: { tool: LINT_TOOL, rule: 'no-unused-vars', messageStartsWith: CATCH_PARAMETER },
  },
  {
    primary: SILENT_CATCH,
    secondary: { tool: LINT_TOOL, rule: 'no-empty' },
  },
];

export function overlapTools(): string[] {
  return [
    ...new Set(
      CROSS_TOOL_OVERLAPS.flatMap(({ primary, secondary }) => [primary.tool, secondary.tool]),
    ),
  ];
}
