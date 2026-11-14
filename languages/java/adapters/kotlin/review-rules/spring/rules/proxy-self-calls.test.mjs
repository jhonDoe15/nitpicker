import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../review-finding.mjs';
import { file, fn, klass } from '../../test-support/facts.mjs';
import { springFindings } from '../spring-findings.mjs';

const IMPORTS = [
  'org.springframework.transaction.annotation.Transactional',
  'org.springframework.transaction.annotation.Propagation',
  'org.springframework.scheduling.annotation.Async',
].map((path) => ({ path, all: false }));

function transactional(...args) {
  return { name: 'Transactional', type: 'Transactional', arguments: args };
}

function arg(name, text) {
  return { name, text };
}

function member(name, line, entry, overrides = {}) {
  return fn(name, {
    owner: 'Ledger',
    line,
    annotationEntries: entry === undefined ? [] : [entry],
    ...overrides,
  });
}

function selfCalls({ caller, classEntry, target, visibility = 'public' }) {
  const facts = file({
    imports: IMPORTS,
    classes: [
      klass('Ledger', {
        annotations: [
          { name: 'Service', type: 'Service', arguments: [] },
          ...(classEntry === undefined ? [] : [classEntry]),
        ],
      }),
    ],
    functions: [member('caller', 10, caller, { visibility }), member('target', 20, target)],
    scopes: [
      { id: 0, k: 'class', name: 'Ledger', qualified: 'Ledger' },
      { id: 1, parent: 0, k: 'fun', name: 'caller', line: 10 },
      { id: 2, parent: 0, k: 'fun', name: 'target', line: 20 },
    ],
    invocations: [{ line: 11, scope: 1, name: 'target', arguments: [], statement: true }],
    locals: [],
    catches: [],
    literals: [],
    nullReturns: [],
    exceptionUses: [],
    throws: [],
  });
  return springFindings([facts], {
    finding: findingFactory(),
    manifest: { spring: true },
    projectFiles: [facts],
    projectRoot: '/missing',
    javaRoots: [],
  })
    .filter(({ rule }) => rule === 'SpringProxySelfCall')
    .map(({ location }) => location.line);
}

const JOIN = (...args) => ({ caller: transactional(), target: transactional(...args) });

describe('SpringProxySelfCall in Kotlin for a call that would only join the transaction', () => {
  it.each([
    ['a plain callee', []],
    ['a read-only callee', [arg('readOnly', 'true')]],
    ['REQUIRED', [arg('propagation', 'Propagation.REQUIRED')]],
    [
      'SUPPORTS with readOnly',
      [arg('propagation', 'Propagation.SUPPORTS'), arg('readOnly', 'true')],
    ],
    ['MANDATORY', [arg('propagation', 'MANDATORY')]],
  ])('skips %s called from a transactional function', (_name, args) => {
    expect(selfCalls(JOIN(...args))).toEqual([]);
  });

  it.each([
    ['REQUIRES_NEW', [arg('propagation', 'Propagation.REQUIRES_NEW')]],
    ['NESTED', [arg('propagation', 'Propagation.NESTED')]],
    ['NOT_SUPPORTED', [arg('propagation', 'Propagation.NOT_SUPPORTED')]],
    ['NEVER', [arg('propagation', 'Propagation.NEVER')]],
    ['a rollbackFor the caller lacks', [arg('rollbackFor', 'Exception::class')]],
    ['a timeout the caller lacks', [arg('timeout', '30')]],
    ['an isolation the caller lacks', [arg('isolation', 'Isolation.SERIALIZABLE')]],
  ])('reports %s', (_name, args) => {
    expect(selfCalls(JOIN(...args))).toEqual([11]);
  });

  it('skips attributes the caller declares the same way and reports different ones', () => {
    const caller = transactional(
      arg('timeout', '5'),
      arg('rollbackFor', 'IllegalStateException::class'),
    );

    expect(
      selfCalls({
        caller,
        target: transactional(
          arg('timeout', '5'),
          arg('rollbackFor', 'IllegalStateException::class'),
        ),
      }),
    ).toEqual([]);
    expect(selfCalls({ caller, target: transactional(arg('timeout', '30')) })).toEqual([11]);
  });

  it('reports a call from a caller outside a transaction', () => {
    expect(selfCalls({ target: transactional() })).toEqual([11]);
    expect(
      selfCalls({
        caller: transactional(arg('propagation', 'Propagation.NOT_SUPPORTED')),
        target: transactional(arg('readOnly', 'true')),
      }),
    ).toEqual([11]);
    expect(
      selfCalls({
        caller: transactional(arg('propagation', 'Propagation.SUPPORTS')),
        target: transactional(),
      }),
    ).toEqual([11]);
  });

  it('reads a class-level transaction for a caller that is not private', () => {
    const target = transactional(arg('readOnly', 'true'));

    expect(selfCalls({ classEntry: transactional(), target })).toEqual([]);
    expect(selfCalls({ classEntry: transactional(), target, visibility: 'private' })).toEqual([11]);
  });

  it('lets a method-level propagation override the class-level transaction', () => {
    const target = transactional(arg('readOnly', 'true'));
    const caller = transactional(arg('propagation', 'Propagation.NOT_SUPPORTED'));

    expect(selfCalls({ classEntry: transactional(), caller, target })).toEqual([11]);
  });

  it('still reports @Async on a callee called from a transaction', () => {
    expect(
      selfCalls({
        caller: transactional(),
        target: { name: 'Async', type: 'Async', arguments: [] },
      }),
    ).toEqual([11]);
  });
});
