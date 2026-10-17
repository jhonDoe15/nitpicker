export const SLOW_TEST_FIXES = {
  java: 'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice{move}',
  typescript:
    'Remove fixed sleeps and real timers (use fake timers) and mock network, database and disk access{move}',
  python:
    'Remove time.sleep and other waits (patch the clock) and fake network, database and disk access{move}',
};

export const SLOW_TEST_MOVES = {
  typescript:
    ', or move it to an integration test (an integration or e2e folder, or *.integration.test.*) if it is one',
  python:
    ', or move it to an integration test (an integration or e2e folder, or @pytest.mark.integration) if it is one',
};
