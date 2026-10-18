export function testConsoleRule(ids, enforcedBy) {
  return {
    id: ids.testConsoleOutput,
    check: 'test-console',
    limit:
      'a test file printing console.error or console.warn output (compared as text with numbers and paths normalized, one random-looking word tolerated) that the base run did not print',
    enforcedBy,
  };
}
