import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { file, klass, routeOf, run, summary, testFile } from '../test-support/facts.mjs';
import { readCatalog } from '../../../../messages/rule-messages.mjs';
import {
  INTERRUPT_MESSAGE,
  SWALLOWED_CANCELLATION_RULE,
  SWALLOWED_INTERRUPT_RULE,
  swallowedHandlerFindings,
} from './swallowed-handlers.mjs';

const caught = (type, overrides = {}) => ({
  line: 4,
  symbol: 'Loader.load',
  type,
  name: 'e',
  cancellation: true,
  interrupt: true,
  ...overrides,
});
const imp = (importPath, alias = null, all = false) => ({ path: importPath, alias, all });
const findingsFor = (handlers, overrides = {}, others = []) =>
  run(swallowedHandlerFindings, [file({ handlers, ...overrides })], {
    declaredIn: [file({ handlers, ...overrides }), ...others],
  });

describe('swallowed cancellation and interrupt in Kotlin', () => {
  it.each([
    [
      'the coroutines alias',
      'CancellationException',
      [imp('kotlinx.coroutines.CancellationException')],
    ],
    [
      'the stdlib alias',
      'CancellationException',
      [imp('kotlin.coroutines.cancellation.CancellationException')],
    ],
    [
      'the java.util.concurrent class',
      'CancellationException',
      [imp('java.util.concurrent.CancellationException')],
    ],
    [
      'a wildcard import of kotlinx.coroutines',
      'CancellationException',
      [imp('kotlinx.coroutines', null, true)],
    ],
    [
      'a renamed import',
      'Cancelled',
      [imp('kotlinx.coroutines.CancellationException', 'Cancelled')],
    ],
    ['a qualified name', 'kotlinx.coroutines.CancellationException', []],
    ['a nullable type', 'java.util.concurrent.CancellationException?', []],
  ])('reports a handler of %s that can complete', (_name, type, imports) => {
    const findings = findingsFor([caught(type)], { imports });

    expect(summary(findings)).toEqual([`${SWALLOWED_CANCELLATION_RULE} Loader.load 4`]);
    expect(findings[0].tool).toBe('pmd');
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/SwallowedCancellation","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports the interrupt in main and test sources and through java.lang or a qualified name', () => {
    const catches = [
      caught('InterruptedException'),
      caught('java.lang.InterruptedException', { line: 9 }),
    ];

    expect(
      summary(
        run(swallowedHandlerFindings, [
          file({ handlers: catches }),
          testFile({ handlers: catches }),
        ]),
      ),
    ).toEqual([
      `${SWALLOWED_INTERRUPT_RULE} Loader.load 4`,
      `${SWALLOWED_INTERRUPT_RULE} Loader.load 9`,
      `${SWALLOWED_INTERRUPT_RULE} Loader.load 4`,
      `${SWALLOWED_INTERRUPT_RULE} Loader.load 9`,
    ]);
  });

  it('follows a type alias to the exception it stands for', () => {
    const findings = findingsFor([caught('Stop')], {
      imports: [imp('kotlinx.coroutines.CancellationException')],
      typeAliases: [{ name: 'Stop', target: 'CancellationException' }],
    });

    expect(summary(findings)).toEqual([`${SWALLOWED_CANCELLATION_RULE} Loader.load 4`]);
  });

  it.each([
    [
      'a handler that cannot swallow cancellation',
      caught('CancellationException', { cancellation: false }),
    ],
    ['a handler that restores the interrupt', caught('InterruptedException', { interrupt: false })],
    ['another exception', caught('IOException')],
    ['a timeout cancellation', caught('TimeoutCancellationException')],
    ['a wildcard that could be another type', caught('Missing')],
  ])('leaves %s alone', (_name, entry) => {
    expect(findingsFor([entry], { imports: [imp('kotlinx.coroutines', null, true)] })).toEqual([]);
  });

  it('leaves a CancellationException that no import brings in alone', () => {
    expect(findingsFor([caught('CancellationException')], { imports: [] })).toEqual([]);
  });

  it('leaves a project class of the same name alone', () => {
    const own = file({ classes: [klass('CancellationException')] });

    expect(findingsFor([caught('CancellationException')], { imports: [] }, [own])).toEqual([]);
  });

  it('gives each handler of one function its own identity', () => {
    const findings = findingsFor(
      [
        caught('java.lang.InterruptedException'),
        caught('java.lang.InterruptedException', { line: 8 }),
      ],
      {},
    );

    expect(findings.map(({ identity }) => identity)).toEqual([
      'SwallowedInterrupt:Loader.load:InterruptedException',
      'SwallowedInterrupt:Loader.load:InterruptedException#2',
    ]);
  });

  it('says the same as the Java rule about an interrupt', () => {
    const gradle = path.resolve(import.meta.dirname, '../../../../gradle/pmd-ruleset.xml');
    const xml = readFileSync(gradle, 'utf8');
    const javaMessage = /name="SwallowedInterrupt"[^>]*message="([^"]+)"/u.exec(xml)[1];
    const fix = readCatalog('pmd').SwallowedInterrupt.fix;

    expect(INTERRUPT_MESSAGE.replace(/ rethrow: throw e, or /u, ' rethrow: ')).toBe(
      `${javaMessage} ${fix}`.replace('declare throws InterruptedException, or ', ''),
    );
  });
});
