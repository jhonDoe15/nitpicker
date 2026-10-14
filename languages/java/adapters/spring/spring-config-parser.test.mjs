import { describe, expect, it } from 'vitest';
import { isProfileKey, parseProperties, parseYaml, relaxKey } from './spring-config-parser.mjs';

const entry = (key, value, line, list = false) => ({ key, value, line, list });
const flat = (documents) =>
  documents.map(({ entries }) => entries.map(({ key, value, line }) => [key, value, line]));

describe('parseProperties', () => {
  it('reads separators, comments, continuations and line numbers', () => {
    const documents = parseProperties(
      [
        '# comment',
        '! also a comment',
        'a.b=1',
        '  c.d : two  ',
        'e.f three',
        'long=one \\',
        '   two',
        'after=x',
        'empty=',
        'esc\\:aped=y',
      ].join('\n'),
    );

    expect(flat(documents)).toEqual([
      [
        ['a.b', '1', 3],
        ['c.d', 'two', 4],
        ['e.f', 'three', 5],
        ['long', 'one two', 6],
        ['after', 'x', 8],
        ['empty', '', 9],
        ['esc:aped', 'y', 10],
      ],
    ]);
  });

  it('does not continue a comment line', () => {
    expect(parseProperties('# note \\\na=1')).toEqual([{ entries: [entry('a', '1', 2)] }]);
  });

  it('joins a continuation over several lines and keeps the first line number', () => {
    expect(parseProperties('a=1\\\n  2\\\n\t3\\\n4\nb=5')).toEqual([
      { entries: [entry('a', '1234', 1), entry('b', '5', 5)] },
    ]);
  });

  it('keeps an escaped backslash at the end of a line from continuing', () => {
    expect(parseProperties('a=x\\\\\nb=y')).toEqual([
      { entries: [entry('a', 'x\\', 1), entry('b', 'y', 2)] },
    ]);
  });

  it('ends a dangling continuation at the end of the file', () => {
    expect(parseProperties('a=1\\')).toEqual([{ entries: [entry('a', '1', 1)] }]);
  });

  it('reads CRLF and CR line endings', () => {
    expect(parseProperties('a=1\r\nb=2\\\r\n  3\r\nc=4\rd=5\r')).toEqual([
      {
        entries: [entry('a', '1', 1), entry('b', '23', 2), entry('c', '4', 4), entry('d', '5', 5)],
      },
    ]);
  });

  it('drops a byte order mark', () => {
    expect(parseProperties('﻿spring.jpa.open-in-view=true')).toEqual([
      { entries: [entry('spring.jpa.open-in-view', 'true', 1)] },
    ]);
  });

  it('decodes unicode, newline, tab, return and form-feed escapes', () => {
    expect(parseProperties('a=\\u0041\\u00e9\nb=x\\ny\\tz\\rw\\fv\nc\\u003Ad=1')).toEqual([
      {
        entries: [entry('a', 'Aé', 1), entry('b', 'x\ny\tz\rw\fv', 2), entry('c:d', '1', 3)],
      },
    ]);
  });

  it('keeps indexed keys as written', () => {
    expect(
      parseProperties('management.endpoints.web.exposure.include[0]=*\ninclude[1] = health'),
    ).toEqual([
      {
        entries: [
          entry('management.endpoints.web.exposure.include[0]', '*', 1),
          entry('include[1]', 'health', 2),
        ],
      },
    ]);
  });

  it('splits documents on #--- and !--- lines', () => {
    expect(
      flat(
        parseProperties(
          'a=1\n#---\nspring.config.activate.on-profile=local\n  !---  \nb=2\n#---\n#---\n',
        ),
      ),
    ).toEqual([
      [['a', '1', 1]],
      [['spring.config.activate.on-profile', 'local', 3]],
      [['b', '2', 5]],
    ]);
  });

  it('returns one empty document for an empty file', () => {
    expect(parseProperties('')).toEqual([{ entries: [] }]);
  });

  it('parses a long run of backslashes in linear time', () => {
    const run = '\\'.repeat(200_000);

    expect(parseProperties(`a=${run}x\n`)).toEqual([
      { entries: [entry('a', `${'\\'.repeat(100_000)}x`, 1)] },
    ]);
  });

  it('parses a long continuation chain in linear time', () => {
    const lines = [...Array.from({ length: 49_999 }, () => 'ab\\'), 'ab'];

    expect(parseProperties(`k=${lines.join('\n')}\nz=1`)).toEqual([
      { entries: [entry('k', 'ab'.repeat(50_000), 1), entry('z', '1', 50_001)] },
    ]);
  });
});

describe('parseYaml', () => {
  it('flattens nested maps and dotted keys with line numbers', () => {
    expect(
      flat(
        parseYaml(
          [
            'spring:',
            '  jpa:',
            '    open-in-view: true',
            '  main.lazy-initialization: false',
            'top: 1',
          ].join('\n'),
        ),
      ),
    ).toEqual([
      [
        ['spring.jpa.open-in-view', 'true', 3],
        ['spring.main.lazy-initialization', 'false', 4],
        ['top', '1', 5],
      ],
    ]);
  });

  it('strips comments outside quotes and unquotes scalars', () => {
    expect(
      flat(
        parseYaml(
          [
            'a: 1 # trailing',
            '# whole line',
            'b: "x # not a comment" # comment',
            "c: 'it''s'",
            "d: ''  # empty",
            'url: http://host:80/path#frag',
            "e: it's fine",
          ].join('\n'),
        ),
      ),
    ).toEqual([
      [
        ['a', '1', 1],
        ['b', 'x # not a comment', 3],
        ['c', "it''s", 4],
        ['d', '', 5],
        ['url', 'http://host:80/path#frag', 6],
        ['e', "it's fine", 7],
      ],
    ]);
  });

  it('ignores list items that are maps and block scalars', () => {
    expect(
      parseYaml(
        [
          'items:',
          '  - name: a',
          '    password: hidden',
          '  - b',
          'script: |',
          '  password: nope',
          '  more',
          'folded: >-',
          '  text',
          'after: ok',
        ].join('\n'),
      ),
    ).toEqual([{ entries: [entry('items', 'b', 4, true), entry('after', 'ok', 10)] }]);
  });

  it('keeps scalar list items only as list entries of their parent key', () => {
    expect(parseYaml('include:\n  - health\n  - "*"\nnext: 1')).toEqual([
      {
        entries: [
          entry('include', 'health', 2, true),
          entry('include', '*', 3, true),
          entry('next', '1', 4),
        ],
      },
    ]);
  });

  it('reads a list at the same indent as its key', () => {
    expect(parseYaml('include:\n- health\n- "*"\nother: 1')).toEqual([
      {
        entries: [
          entry('include', 'health', 2, true),
          entry('include', '*', 3, true),
          entry('other', '1', 4),
        ],
      },
    ]);
  });

  it('splits multi-document files and drops empty documents', () => {
    expect(
      flat(
        parseYaml(
          [
            '---',
            'a: 1',
            '---',
            'spring:',
            '  config:',
            '    activate:',
            '      on-profile: test',
            'b: 2',
          ].join('\n'),
        ),
      ),
    ).toEqual([
      [['a', '1', 2]],
      [
        ['spring.config.activate.on-profile', 'test', 7],
        ['b', '2', 8],
      ],
    ]);
  });

  it('returns one empty document for an empty file', () => {
    expect(parseYaml('')).toEqual([{ entries: [] }]);
  });

  it('reads CRLF line endings and a byte order mark', () => {
    expect(parseYaml('﻿spring:\r\n  jpa:\r\n    open-in-view: true\r\nnext: "x"\r\n')).toEqual([
      { entries: [entry('spring.jpa.open-in-view', 'true', 3), entry('next', 'x', 4)] },
    ]);
  });

  it('reads a single-line flow map one or more levels deep', () => {
    expect(
      parseYaml(
        [
          'spring:',
          '  jpa:',
          '    hibernate: {ddl-auto: create}',
          '  datasource: {password: abc, url: "jdbc:h2:mem:x", pool: {max: 3, tags: [a, b]}}',
          'top: {a: {b: {c: deep}}}',
          'empty: {}',
          'nulls: {a: , b: }',
        ].join('\n'),
      ),
    ).toEqual([
      {
        entries: [
          entry('spring.jpa.hibernate.ddl-auto', 'create', 3),
          entry('spring.datasource.password', 'abc', 4),
          entry('spring.datasource.url', 'jdbc:h2:mem:x', 4),
          entry('spring.datasource.pool.max', '3', 4),
          entry('spring.datasource.pool.tags', 'a', 4, true),
          entry('spring.datasource.pool.tags', 'b', 4, true),
          entry('top.a.b.c', 'deep', 5),
        ],
      },
    ]);
  });

  it('reads single-line flow sequences as list values', () => {
    expect(
      parseYaml('include: [health, "*"]  # all\nnone: []\nmixed: [a, {b: c}, [d], \'e,f\']'),
    ).toEqual([
      {
        entries: [
          entry('include', 'health', 1, true),
          entry('include', '*', 1, true),
          entry('mixed', 'a', 3, true),
          entry('mixed', 'e,f', 3, true),
        ],
      },
    ]);
  });

  it('skips a flow collection that continues on later lines', () => {
    expect(parseYaml('a: {\n  password: x\n}\nb: [\n  "*"\n]\nc: 1')).toEqual([
      { entries: [entry('c', '1', 7)] },
    ]);
  });

  it('strips a leading !!str tag from scalars', () => {
    expect(parseYaml('a: !!str 123\nb: !!str "x y"\nc:\n  - !!str 7\nd: {e: !!str 8}')).toEqual([
      {
        entries: [
          entry('a', '123', 1),
          entry('b', 'x y', 2),
          entry('c', '7', 4, true),
          entry('d.e', '8', 5),
        ],
      },
    ]);
  });

  it('keeps a key with only an anchor or tag as a parent', () => {
    expect(
      parseYaml(
        'base: &b\n  password: one\nx: !tag\n  password: two\ny: &c !tag\n  password: three',
      ),
    ).toEqual([
      {
        entries: [
          entry('base.password', 'one', 2),
          entry('x.password', 'two', 4),
          entry('y.password', 'three', 6),
        ],
      },
    ]);
  });

  it('does not interpret aliases or merge keys', () => {
    expect(parseYaml('defaults: &d\n  password: abc\nprod:\n  <<: *d\n  token: *t')).toEqual([
      {
        entries: [
          entry('defaults.password', 'abc', 2),
          entry('prod.<<', '*d', 4),
          entry('prod.token', '*t', 5),
        ],
      },
    ]);
  });

  it('skips continuation lines of multi-line quoted and plain scalars', () => {
    expect(
      parseYaml(
        'a: "line one\n  password: abc\n  end"\nb: some text\n  token: here\nc: \'x\n  secret: y\'\nd: 1',
      ),
    ).toEqual([{ entries: [entry('b', 'some text', 4), entry('d', '1', 8)] }]);
  });

  it('ignores complex keys', () => {
    expect(parseYaml('? a\n: b\nc: 1')).toEqual([{ entries: [entry('c', '1', 3)] }]);
  });
});

describe('relaxKey', () => {
  it('matches camel, snake and kebab case', () => {
    const forms = ['spring.jpa.open-in-view', 'spring.jpa.openInView', 'SPRING.JPA.open_in_view'];

    expect(forms.map(relaxKey)).toEqual(Array(3).fill('spring.jpa.openinview'));
  });

  it('drops numeric list indexes', () => {
    expect(['include[0]', 'include[12]', 'include[0][1]', 'include[name]'].map(relaxKey)).toEqual([
      'include',
      'include',
      'include',
      'include[name]',
    ]);
  });
});

describe('isProfileKey', () => {
  it('accepts the profile keys in any spelling and indexed form', () => {
    expect(
      [
        'spring.config.activate.on-profile',
        'Spring.Config.Activate.onProfile',
        'spring.profiles',
        'spring.profiles[1]',
        'spring.profiles.active',
        'spring.profile',
      ].map(isProfileKey),
    ).toEqual([true, true, true, true, false, false]);
  });
});
