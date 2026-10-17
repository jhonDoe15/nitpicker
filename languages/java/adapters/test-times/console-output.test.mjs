import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { consoleEntriesOf, consoleMessages, readConsoleEntries } from './console-output.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directoryWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-console-output-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const SUITE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="shop.OrderTest">
  <testcase name="totals()" classname="shop.OrderTest">
    <system-out><![CDATA[12:00:01.123 [main] INFO shop.Orders - started
12:00:01.200 [main] WARN shop.Orders - price missing for 42
]]></system-out>
    <system-err><![CDATA[java.lang.IllegalStateException: closed
\tat shop.Orders.total(Orders.java:12)
\t... 3 more
]]></system-err>
  </testcase>
  <testcase name="quiet" classname="shop.OrderTest"/>
  <system-err><![CDATA[Mockito is self-attaching
  to enable the inline mock maker
]]></system-err>
</testsuite>
`;

describe('consoleMessages', () => {
  it('keeps every stderr block and only the stdout blocks with a warning or error level', () => {
    expect(
      consoleMessages({
        out: '  .   ____\n :: Spring Boot ::\nINFO ready\n2024-01-01 WARN  [main] slow start\n',
        err: 'cache miss\n\nfailed to close\n    caused by timeout\n\tat a.B.c(B.java:1)\n',
      }),
    ).toEqual([
      'cache miss',
      'failed to close caused by timeout',
      '2024-01-01 WARN  [main] slow start',
    ]);
  });
});

const SELF_ATTACH = [
  'Mockito is currently self-attaching to enable the inline-mock-maker.',
  'WARNING: A Java agent has been loaded dynamically (/home/u/.m2/byte-buddy-agent-1.15.11.jar)',
  'WARNING: If a serviceability tool is in use, please run with -XX:+EnableDynamicAgentLoading',
  'WARNING: Dynamic loading of agents will be disallowed by default in a future release',
];

describe('consoleMessages of JVM and logging bootstrap output', () => {
  it('reads a multi-line JVM warning and the line it follows as one message', () => {
    expect(consoleMessages({ err: `${SELF_ATTACH.join('\n')}\n` })).toEqual([
      SELF_ATTACH.join(' '),
    ]);
    expect(
      consoleMessages({ err: `${SELF_ATTACH.slice(1).join('\n')}\n${SELF_ATTACH[0]}\n` }),
    ).toEqual([[...SELF_ATTACH.slice(1), SELF_ATTACH[0]].join(' ')]);
  });

  it('keeps a warning that a blank line separates as its own message', () => {
    expect(consoleMessages({ err: `cache miss\n\n${SELF_ATTACH[1]}\n` })).toEqual([
      'cache miss',
      SELF_ATTACH[1],
    ]);
  });

  it("drops SLF4J's provider notices, which describe the test classpath", () => {
    expect(
      consoleMessages({
        err: [
          'SLF4J(W): No SLF4J providers were found.',
          'SLF4J(W): Defaulting to no-operation (NOP) logger implementation',
          'SLF4J: Failed to load class "org.slf4j.impl.StaticLoggerBinder".',
          'pool closed early',
        ].join('\n'),
      }),
    ).toEqual(['pool closed early']);
  });
});

describe('consoleEntriesOf', () => {
  it('reads the output of each test case and of the suite outside them', () => {
    expect(consoleEntriesOf(SUITE)).toEqual([
      {
        className: 'shop.OrderTest',
        test: '',
        messages: ['Mockito is self-attaching to enable the inline mock maker'],
      },
      {
        className: 'shop.OrderTest',
        test: 'totals',
        messages: [
          'java.lang.IllegalStateException: closed',
          '12:00:01.200 [main] WARN shop.Orders - price missing for 42',
        ],
      },
      { className: 'shop.OrderTest', test: 'quiet', messages: [] },
    ]);
  });
});

describe('readConsoleEntries', () => {
  it('names the test source of each entry and reads redirected output files', () => {
    const projectRoot = directoryWith({
      'src/test/java/shop/OrderTest.java': 'class OrderTest {}',
    });
    const reportRoot = directoryWith({
      'test-results/test/TEST-shop.OrderTest.xml': SUITE,
      'test-results/test/shop.GoneTest-output.txt': 'INFO ok\nERROR lost connection\n',
      'test-results/test/notes.txt': 'ERROR ignored',
    });

    expect(readConsoleEntries({ reportRoot, projectRoot, testRoots: ['src/test/java'] })).toEqual([
      {
        file: 'src/test/java/shop/OrderTest.java',
        test: '',
        messages: ['Mockito is self-attaching to enable the inline mock maker'],
      },
      {
        file: 'src/test/java/shop/OrderTest.java',
        test: 'totals',
        messages: [
          'java.lang.IllegalStateException: closed',
          '12:00:01.200 [main] WARN shop.Orders - price missing for 42',
        ],
      },
      { file: '.', test: '', messages: ['ERROR lost connection'] },
    ]);
  });

  it('reads nothing when the build wrote no test results', () => {
    const root = directoryWith({});

    expect(readConsoleEntries({ reportRoot: root, projectRoot: root, testRoots: [] })).toEqual([]);
  });
});
