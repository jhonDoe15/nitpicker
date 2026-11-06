export function toolPrecedenceOf(tools = {}) {
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [tool, settings.precedence]),
  );
}
