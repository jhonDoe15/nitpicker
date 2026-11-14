export function statementWindows(list) {
  return list.flatMap((_statement, from) =>
    Array.from({ length: list.length - from }, (_unused, offset) =>
      list.slice(from, from + offset + 1),
    ),
  );
}
