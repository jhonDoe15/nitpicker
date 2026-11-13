import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { pendingFuturesNotFailedOnClose } from './pending-futures.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return pendingFuturesNotFailedOnClose(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const PENDING =
  '    private val pending = ConcurrentHashMap<String, CompletableDeferred<String>>()';
const inClass = (closeBody, extra = '') =>
  [
    'class Replies : AutoCloseable {',
    PENDING,
    extra,
    '    override fun close() {',
    ...closeBody.split('\n').map((line) => `        ${line}`),
    '    }',
    '}',
    '',
  ].join('\n');

describe('pendingFuturesNotFailedOnClose', () => {
  it.each([
    ['a clear only', inClass('pending.clear()')],
    ['another map settled', inClass('other.values.forEach { it.cancel() }\npending.clear()')],
    [
      'a mutable map',
      inClass('pending.clear()').replace(/ConcurrentHashMap<(.*)>\(\)/, 'mutableMapOf<$1>()'),
    ],
  ])('reports %s', (_name, source) => {
    expect(lines(source)).toEqual([2]);
  });

  it.each([
    [
      'values forEach',
      inClass('pending.values.forEach { it.completeExceptionally(IllegalStateException()) }'),
    ],
    ['a for loop', inClass('for (reply in pending.values) {\n    reply.cancel()\n}')],
    [
      'a helper',
      inClass(
        'failAll()',
        '    private fun failAll() {\n        pending.values.forEach { it.cancel() }\n    }',
      ),
    ],
    ['a free helper function', inClass('failAll(pending)')],
    ['a method reference', inClass('pending.values.forEach(::fail)')],
    ['no close function', 'class Replies {\n' + PENDING + '\n}\n'],
    ['a plain map', inClass('names.clear()').replace('CompletableDeferred<String>', 'String')],
  ])('allows %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
