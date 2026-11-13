export const CROSS_TOOL_OVERLAPS = [
  {
    primary: { tool: 'eslint-errors', rule: 'nitpicker/no-silent-catch' },
    secondary: {
      tool: 'eslint-lint',
      rule: '@typescript-eslint/no-unused-vars',
      messageStartsWith: 'Catch parameter',
    },
  },
  {
    primary: { tool: 'eslint-errors', rule: 'nitpicker/no-silent-catch' },
    secondary: {
      tool: 'eslint-lint',
      rule: 'no-unused-vars',
      messageStartsWith: 'Catch parameter',
    },
  },
  {
    primary: { tool: 'eslint-errors', rule: 'nitpicker/no-silent-catch' },
    secondary: { tool: 'eslint-lint', rule: 'no-empty' },
  },
];

export function overlapTools() {
  return [
    ...new Set(
      CROSS_TOOL_OVERLAPS.flatMap(({ primary, secondary }) => [primary.tool, secondary.tool]),
    ),
  ];
}
