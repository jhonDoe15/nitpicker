import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { sqlStringBuilding } from './sql.mjs';
import { kotlinDeclarations } from './sql-values.mjs';

const MODEL = [
  'enum class SortColumn(val sql: String) { NAME("name"), CREATED("created_at") }',
  'data class Order(val id: Long, val customer: String)',
].join('\n');

function found(lines, header = 'fun f(id: String, name: String, limit: Int, order: Order) {') {
  const source = `${header}\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  const declarations = kotlinDeclarations([scanned, scanKotlinSource(MODEL)]);
  return sqlStringBuilding(scanned, { declarations }).map(({ offset }) => lineOf(scanned, offset));
}

describe('sqlStringBuilding', () => {
  it.each([
    [
      'a template in a query call',
      ['jdbcTemplate.queryForObject("SELECT * FROM users WHERE id = \'$id\'", mapper)'],
    ],
    [
      'a template expression',
      ['val sql = "SELECT * FROM orders WHERE customer = \'${order.customer}\'"'],
    ],
    ['a concatenation', ['val sql = "SELECT * FROM users WHERE name = \'" + name + "\'"']],
    [
      'a concatenation over lines',
      ['val sql = "SELECT * FROM users " +', '    "WHERE name = \'" + name.trim() + "\'"'],
    ],
    [
      'a raw string',
      ['val sql = """', '    SELECT * FROM users', "    WHERE name = '$name'", '""".trimIndent()'],
    ],
    [
      'lowercase SQL in a statement',
      ['statement.executeQuery("select * from users where email = \'$name\'")'],
    ],
    ['JPQL in createQuery', ['entityManager.createQuery("from User u where u.name = \'$name\'")']],
    ['an appended filter', ['sql += " AND status = \'$name\'"']],
    ['a format call', ['val sql = String.format("DELETE FROM %s WHERE id = %d", name, limit)']],
    ['a format extension', ['jdbc.update("UPDATE users SET name = \'%s\'".format(name))']],
    [
      'a lowercase variable passed to a sink',
      ['val sql = "select * from users where id = $id"', 'jdbc.query(sql, mapper)'],
    ],
    [
      'a string member of a model',
      ['val sql = "SELECT * FROM orders WHERE customer = ${order.customer}"'],
    ],
  ])('flags %s', (_name, lines) => {
    expect(found(lines)).toEqual([2]);
  });

  it('flags a helper that returns the statement', () => {
    expect(
      found(
        [],
        'fun byName(name: String) =\n    "SELECT * FROM users WHERE name = \'$name\'"\nfun g() {',
      ),
    ).toEqual([2]);
  });

  it.each([
    ['bind parameters', ['jdbcTemplate.query("SELECT * FROM users WHERE id = ?", mapper, id)']],
    [
      'named parameters',
      ['jdbc.query("SELECT * FROM users WHERE name = :name", mapOf("name" to name), mapper)'],
    ],
    ['a constant table', ['jdbc.query("SELECT * FROM $TABLE WHERE id = ?", mapper, id)']],
    [
      'a qualified constant',
      ['jdbc.query("SELECT * FROM ${Tables.ORDERS} WHERE id = ?", mapper, id)'],
    ],
    ['a numeric parameter', ['jdbc.query("SELECT * FROM users LIMIT $limit", mapper)']],
    [
      'a numeric model member',
      ['jdbc.query("SELECT * FROM orders WHERE id = ${order.id}", mapper)'],
    ],
    [
      'an enum column',
      [
        'val column: SortColumn = pick()',
        'jdbc.query("SELECT * FROM users ORDER BY ${column.sql}", mapper)',
      ],
    ],
    [
      'a placeholder list',
      [
        'jdbc.query("SELECT * FROM users WHERE id IN (${ids.joinToString(", ") { "?" }})", mapper, *ids)',
      ],
    ],
    [
      'placeholders from a list',
      [
        'jdbc.query("SELECT * FROM users WHERE id IN (${List(ids.size) { "?" }.joinToString(",")})", mapper)',
      ],
    ],
    [
      'repeated placeholders',
      [
        'val marks = "?, ".repeat(ids.size).dropLast(2)',
        'jdbc.query("SELECT * FROM users WHERE id IN ($marks)", mapper)',
      ],
    ],
    [
      'literal filters',
      [
        'val conditions = mutableListOf<String>()',
        'conditions.add("name = ?")',
        'conditions += "status = ?"',
        'jdbc.query("SELECT * FROM users WHERE ${conditions.joinToString(" AND ")}", mapper)',
      ],
    ],
    [
      'a conditional literal',
      [
        'val filter = if (active) "AND active = true" else ""',
        'jdbc.query("SELECT * FROM users WHERE id = ? $filter", mapper, id)',
      ],
    ],
    [
      'a message that is not SQL',
      [
        'log.info("User $name selected from the list")',
        'throw IllegalStateException("Order $id not found")',
      ],
    ],
    ['lowercase text outside a sink', ['val title = "select a user from $name"']],
    ['an escaped dollar', ['jdbc.query("SELECT * FROM users WHERE price > \\$id", mapper)']],
  ])('passes %s', (_name, lines) => {
    expect(
      found(
        lines,
        'fun f(id: String, name: String, limit: Int, order: Order, ids: List<Long>, active: Boolean) {',
      ),
    ).toEqual([]);
  });

  it('reads a one-line companion constant as inert, and a runtime value next to it as runtime', () => {
    const header = 'class Repo(private val jdbc: JdbcTemplate) {';
    const companion = 'companion object { private const val table = "users" }';

    expect(
      found(
        [
          companion,
          'fun find(id: Long) = jdbc.queryForList("SELECT * FROM $table WHERE id = ?", id)',
        ],
        header,
      ),
    ).toEqual([]);
    expect(
      found(
        [
          companion,
          'fun find(name: String) = jdbc.queryForList("SELECT * FROM $table WHERE name = \'$name\'")',
        ],
        header,
      ),
    ).toEqual([3]);
  });

  it('does not take a list a function fills for a literal one', () => {
    expect(
      found([
        'val conditions = mutableListOf<String>()',
        'conditions.add("name = \'$name\'")',
        'jdbc.query("SELECT * FROM users WHERE ${conditions.joinToString(" AND ")}", mapper)',
      ]),
    ).toEqual([4]);
  });
});
