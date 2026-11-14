import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { main } from '../src/main/composition-root.js';

test('writes the greeting to standard output', () => {
  const write = mock.method(process.stdout, 'write', () => true);
  main(['Ada']);
  assert.deepEqual(
    write.mock.calls.map((call) => call.arguments[0]),
    ['Hello, Ada!\n'],
  );
  write.mock.restore();
});
