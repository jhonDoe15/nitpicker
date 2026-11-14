import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { unboundedCollectionProperty } from './add-only-properties.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return unboundedCollectionProperty(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const bean = (members) => `@Service\nclass Sessions {\n${members}}\n`;
const MAP = '    private val sessions = ConcurrentHashMap<String, Session>()\n';

describe('unboundedCollectionProperty', () => {
  it.each([
    [
      'a map that only gains',
      bean(`${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n    }\n`),
      [3],
    ],
    [
      'a put call',
      bean(`${MAP}    fun open(id: String, s: Session) {\n        sessions.put(id, s)\n    }\n`),
      [3],
    ],
    [
      'a mutable list',
      bean(
        '    private val events = mutableListOf<String>()\n    fun log(event: String) {\n        events.add(event)\n    }\n',
      ),
      [3],
    ],
    [
      'a mutable set',
      bean(
        '    private val seen = mutableSetOf<String>()\n    fun see(token: String) {\n        seen += token\n    }\n',
      ),
      [3],
    ],
    [
      'a map that is only logged and inspected',
      bean(
        `${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n        log.info("open", sessions)\n        check(sessions.containsKey(id))\n    }\n    fun view() = Collections.unmodifiableMap(sessions)\n`,
      ),
      [3],
    ],
    [
      'an expression bodied adder',
      bean(`${MAP}    fun open(id: String, s: Session) = sessions.put(id, s)\n`),
      [3],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    [
      'removal',
      bean(
        `${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n    }\n    fun end(id: String) {\n        sessions.remove(id)\n    }\n`,
      ),
    ],
    [
      'a clear',
      bean(
        `${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n    }\n    fun reset() {\n        sessions.clear()\n    }\n`,
      ),
    ],
    [
      'a size bound',
      bean(
        `${MAP}    fun open(id: String, s: Session) {\n        if (sessions.size < 100) sessions[id] = s\n    }\n`,
      ),
    ],
    [
      'a register function',
      bean(`${MAP}    fun register(id: String, s: Session) {\n        sessions[id] = s\n    }\n`),
    ],
    [
      'a literal key',
      bean(`${MAP}    fun open(s: Session) {\n        sessions["main"] = s\n    }\n`),
    ],
    [
      'a class that is not a bean',
      `class Sessions {\n${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n    }\n}\n`,
    ],
    [
      'a handed over map',
      bean(
        `${MAP}    fun open(id: String, s: Session) {\n        sessions[id] = s\n        evict(sessions)\n    }\n`,
      ),
    ],
    ['a read only map', bean(`${MAP}    fun find(id: String) = sessions[id]\n`)],
  ])('allows %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
