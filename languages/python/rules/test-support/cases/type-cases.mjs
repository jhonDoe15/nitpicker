const deprecated = (tool, rule) => ({
  name: `${tool} deprecated API names the replacement`,
  fixture: 'deprecated-api',
  tool,
  rule,
  mention: 'the replacement the deprecation notice names',
});

export const TYPE_CASES = [
  deprecated('mypy', 'deprecated'),
  deprecated('pyright', 'reportDeprecated'),
  deprecated('basedpyright', 'reportDeprecated'),
];
