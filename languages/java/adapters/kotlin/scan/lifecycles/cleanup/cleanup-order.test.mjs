import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { cleanupSkippedOnFailure } from './cleanup-order.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return cleanupSkippedOnFailure(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const HEADER = 'class Client(private val a: Closeable, private val b: Closeable) : AutoCloseable {';
const inClass = (body, name = 'close') => {
  const lines = body.split('\n').map((line) => `        ${line}`);
  return [
    HEADER,
    '    var state: Any? = Any()',
    `    override fun ${name}() {`,
    ...lines,
    '    }',
    '}',
    '',
  ].join('\n');
};

describe('cleanupSkippedOnFailure', () => {
  it.each([
    ['two closes', inClass('a.close()\nb.close()'), [4]],
    ['one line', inClass('a.close(); b.close()'), [4]],
    ['a close then a reset', inClass('a.close()\nstate = null'), [4]],
    ['a close then clear', inClass('a.disconnect()\nitems.clear()'), [4]],
    ['a safe call', inClass('a?.close()\nb?.close()'), [4]],
    ['a shutdown function', inClass('a.stop()\nb.stop()', 'shutdown'), [4]],
    [
      'an after hook',
      'class T {\n    @AfterEach\n    fun release() {\n        server.stop()\n        db.close()\n    }\n}\n',
      [4],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    ['use', inClass('a.use {\n    b.close()\n}')],
    ['try and finally', inClass('try {\n    a.close()\n} finally {\n    state = null\n}')],
    ['a single close', inClass('a.close()')],
    ['another function', inClass('a.close()\nb.close()', 'start')],
    ['a close then other work', inClass('a.close()\nlog.info("closed")')],
    ['each close guarded', inClass('runCatching { a.close() }\nb.close()')],
    ['executor shutdown', inClass('pool.shutdown()\nother.shutdown()')],
  ])('allows %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
