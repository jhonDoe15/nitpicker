export const SLOW_TEST_FIXES = {
  java: 'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice{move}',
  typescript:
    'Remove fixed sleeps and real timers (use fake timers) and mock network, database and disk access{move}',
  python:
    'Remove time.sleep and other waits (patch the clock) and fake network, database and disk access{move}',
};

export const SLOW_TEST_MOVES = {
  typescript:
    ', or move it to an integration test (an integration or e2e folder under the test roots, ' +
    'or *.integration.test.*) if it is one',
  pytest:
    ', or move it to an integration test (an integration or e2e folder under tests, ' +
    'or an integration marker registered in the pytest config) if it is one',
  unittest:
    ', or move it to an integration test (an integration or e2e folder under tests, ' +
    'or a class named Integration*) if it is one',
};
