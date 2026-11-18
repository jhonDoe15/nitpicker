import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../max-value-sums/source-file.mjs';
import { findMalformedQueries as untypedFind } from './query-text.mjs';

const parse: (text: string, options: { file: string; kotlin: boolean }) => unknown = untypedParse;
const find: (source: unknown) => { readonly kind: string }[] = untypedFind;

function java(body: string) {
  const text = `class Mapper {\n  String build(String group) {\n${body}\n  }\n}\n`;
  return find(parse(text, { file: 'Mapper.java', kotlin: false })).map(({ kind }) => kind);
}

function kotlin(body: string) {
  const text = `class Mapper {\n  fun build(group: String): String {\n${body}\n  }\n}\n`;
  return find(parse(text, { file: 'Mapper.kt', kotlin: true })).map(({ kind }) => kind);
}

describe('MalformedQueryText in Java', () => {
  it('reports an operator with no operand, as in the config mapper fix', () => {
    expect(
      java(
        'String where = " WHERE 1=1";\nif (group != null) {\nwhere += ' +
          '" AND group_id LIKE ";\nparams.add(group);\n}\nreturn where;',
      ),
    ).toEqual(['operand']);
    expect(java('return jdbc.query("SELECT * FROM t WHERE a = ", mapper);')).toEqual(['operand']);
  });

  it('reports an insert with fewer values than columns', () => {
    expect(
      java(
        'return "INSERT INTO lock_table (a, b, c, d, created, ' +
          'modified, status) "\n + "values (?, ?, ?, ?, SYSDATETIME(), ' +
          'SYSDATETIME())";',
      ),
    ).toEqual(['count']);
  });

  it('reports parts that run two words together', () => {
    expect(java('return "SELECT * FROM t" + "WHERE a = ?";')).toEqual(['joined']);
    expect(java('String s = "if x then" + "redis.call(\'get\', k) end";\nreturn s;')).toEqual([
      'joined',
    ]);
  });

  it('allows complete text, builders and appended fragments that continue', () => {
    expect(
      java(
        'String where = "";\nwhere += " AND group_id LIKE ?";\nparams.add(group);\nreturn where;',
      ),
    ).toEqual([]);
    expect(
      java('String where = "";\nwhere += " AND group_id LIKE ";\nwhere += "?";\nreturn where;'),
    ).toEqual([]);
    expect(java('return "SELECT * FROM t WHERE a = " + group;')).toEqual([]);
    expect(java('return "SELECT * FROM t " + "WHERE a = ?";')).toEqual([]);
    expect(java('return "SELECT * FROM t" + " WHERE a = ?";')).toEqual([]);
    expect(java('return "INSERT INTO t (a, b) VALUES (?, now())";')).toEqual([]);
    expect(java('sb.append(" AND a = ").append(value);\nreturn sb.toString();')).toEqual([]);
    expect(java('String label = "Select a value =";\nlog(label);\nreturn label;')).toEqual([]);
    expect(java('String name = "user_" + "name";\nreturn name;')).toEqual([]);
  });
});

describe('MalformedQueryText in Kotlin', () => {
  it('reports the same slips', () => {
    expect(kotlin('return jdbc.query("SELECT * FROM t WHERE a = ", mapper)')).toEqual(['operand']);
    expect(kotlin('return "SELECT * FROM t" + "WHERE a = ?"')).toEqual(['joined']);
    expect(kotlin('return "SELECT * FROM t WHERE a = $group"')).toEqual([]);
  });
});
