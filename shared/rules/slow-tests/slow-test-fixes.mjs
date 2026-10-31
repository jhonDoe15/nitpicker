export const SLOW_TEST_FIXES = {
  java: 'Remove Thread.sleep and other waits, start a smaller Spring context or a test slice{move}',
  typescript:
    'Remove fixed sleeps and real timers (use fake timers) and mock network, database and disk access{move}',
  python:
    'Remove time.sleep and other waits (patch the clock) and fake network, database and disk access{move}',
  go: 'Remove time.Sleep and other waits (inject the clock, or wait on a channel or sync.WaitGroup) and fake network, database and disk access with an interface or httptest{move}',
};

export const SLOW_TEST_MOVES = {
  typescript:
    ', or move it to an integration test (an integration or e2e folder under the test roots, ' +
    'or *.integration.test.*) if it is one',
  pytest:
    ', or move it to an integration test (an integration or e2e folder, ' +
    'or an integration or e2e marker registered in the pytest config) if it is one',
  unittest: ', or move it to an integration test (an integration or e2e folder) if it is one',
  go:
    ', or move it to an integration test (an integration or e2e folder, a *_integration_test.go file, ' +
    'an integration or e2e build tag, or a test that skips under testing.Short()) if it is one',
};
