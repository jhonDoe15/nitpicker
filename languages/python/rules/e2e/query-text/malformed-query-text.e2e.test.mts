import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('malformed-query-text', () => {
  itOutcomes('flags query text that is malformed once its parts are joined', [
    [
      'a LIKE with no operand on an appended fragment',
      'def search(cursor, group):\n    where = "SELECT * FROM info ' +
        'WHERE tenant = %s"\n    if group:\n        where += " AND ' +
        'group_id LIKE "\n    cursor.execute(where)\n',
      ['malformed-query-text:4 operand|AND group_id LIKE'],
    ],
    [
      'an insert with fewer values than columns',
      'def lock(cursor):\n    cursor.execute("INSERT INTO lock_table (a, b, c) VALUES (%s, %s)")\n',
      ['malformed-query-text:2 count|3 2'],
    ],
    [
      'an operator followed by a keyword',
      'def find(cursor):\n    cursor.execute("SELECT * FROM t WHERE a = AND b = %s")\n',
      ['malformed-query-text:2 operand|SELECT * FROM t WHERE a = AND b = %s'],
    ],
  ]);

  itOutcomes('leaves well-formed and unrelated text alone', [
    [
      'a bound operand',
      'def search(cursor, group):\n    where = "SELECT * FROM info ' +
        'WHERE tenant = %s"\n    where += " AND group_id LIKE %s"\n    ' +
        'cursor.execute(where)\n',
      [],
    ],
    [
      'a fragment extended by the next statement',
      'def search(cursor, group):\n    where = "SELECT * FROM info ' +
        'WHERE tenant ="\n    where += " %s"\n    ' +
        'cursor.execute(where)\n',
      [],
    ],
    [
      'an insert whose lists match',
      'def lock(cursor):\n    cursor.execute("INSERT INTO t (a, b) VALUES (%s, now())")\n',
      [],
    ],
    ['prose that mentions select', 'def doc():\n    return "Select a value = anything"\n', []],
    [
      'a long prose constant that starts with where',
      'DOC = "where criteria is being ignored as this version of the library is too old ="\n',
      [],
    ],
    ['a docstring', 'def find():\n    """Select rows where a ="""\n', []],
  ]);
});
