import { describe, expect, it } from 'vitest';
import {
  file,
  fn,
  importOf,
  klass,
  run,
  sourceRouted,
  summary,
  useLaunch,
} from '../test-support/facts.mjs';
import { CHILD_OUTLIVES_RESOURCE_RULE, childLifetimeFindings } from './resource-lifetime.mjs';

const COROUTINES = importOf('kotlinx.coroutines', { all: true });
const childMessage = (resource, reopened) =>
  `\`launch\` starts a child coroutine in \`scope\`, which keeps running after this \`use\` block, and the child reads \`${resource}\`; \`use\` closes \`${resource}\` when the block ends, so the child can run on a closed resource. Start the child inside \`coroutineScope { ... }\` or \`supervisorScope { ... }\` in the block, join it before the block ends (\`.join()\` or \`.await()\`), or open and close the resource inside the child (\`scope.launch { ${reopened}.use { ... } }\`).`;
const findingsFor = (launches, overrides = {}) =>
  run(childLifetimeFindings, [
    file({ imports: [COROUTINES], useLaunches: launches, ...overrides }),
  ]);

describe('child coroutine started in a use block', () => {
  it('reports a launch in an injected scope that reads the resource, with the route and the allowed forms', () => {
    const findings = findingsFor([useLaunch({ line: 14 })]);

    expect(summary(findings)).toEqual([
      `${CHILD_OUTLIVES_RESOURCE_RULE} Store.copy:reader:launch 14`,
    ]);
    expect(findings[0].tool).toBe('kotlin-source');
    expect(findings[0].message).toBe(
      sourceRouted(childMessage('reader', 'reader'), CHILD_OUTLIVES_RESOURCE_RULE),
    );
  });

  it.each([
    ['async', useLaunch({ launch: 'async' })],
    ['a scope built by CoroutineScope(...)', useLaunch({ scopeType: 'call:CoroutineScope' })],
    ['GlobalScope', useLaunch({ scope: 'GlobalScope', scopeType: undefined })],
    [
      'an implicit enclosing builder scope',
      useLaunch({ scope: undefined, scopeType: undefined, implicit: 'builder' }),
    ],
    [
      'an implicit CoroutineScope class',
      useLaunch({ scope: undefined, scopeType: undefined, implicit: 'class' }),
    ],
    [
      'a CoroutineScope extension function',
      useLaunch({ scope: undefined, scopeType: undefined, implicit: 'extension' }),
    ],
    [
      'a scope typed by a class that implements CoroutineScope',
      useLaunch({ scopeType: 'AppScope' }),
    ],
  ])('reports %s', (_name, launch) => {
    const classes = [
      klass('Store', { supers: ['CoroutineScope'] }),
      klass('AppScope', { supers: ['CoroutineScope'] }),
    ];

    expect(findingsFor([launch], { classes })).toHaveLength(1);
  });

  it('reads the resource name `it` for an implicit lambda parameter', () => {
    const findings = findingsFor([useLaunch({ resource: 'it' })]);

    expect(findings[0].message).toBe(
      sourceRouted(childMessage('it', 'resource'), CHILD_OUTLIVES_RESOURCE_RULE),
    );
  });

  it('numbers the findings of one function by order', () => {
    const findings = findingsFor([useLaunch({ line: 3 }), useLaunch({ line: 8 })]);

    expect(findings.map(({ identity }) => identity)).toEqual([
      'ChildCoroutineOutlivesResource:Store.copy:reader:launch',
      'ChildCoroutineOutlivesResource:Store.copy:reader:launch#2',
    ]);
  });
});

describe('use blocks the rule leaves alone', () => {
  it.each([
    ['a scope of a type it cannot read', useLaunch({ scopeType: 'AppExecutor' })],
    ['a scope with no declared type', useLaunch({ scopeType: undefined })],
    ['an implicit scope with no evidence', useLaunch({ scope: undefined, scopeType: undefined })],
    [
      'a class that does not implement CoroutineScope',
      useLaunch({ scope: undefined, scopeType: undefined, implicit: 'class' }),
    ],
    ['a launch that is not kotlinx.coroutines', useLaunch({ launch: 'thread' })],
  ])('allows %s', (_name, launch) => {
    expect(findingsFor([launch])).toEqual([]);
  });

  it('allows launch and async that are not imported from kotlinx.coroutines', () => {
    expect(findingsFor([useLaunch()], { imports: [] })).toEqual([]);
    expect(findingsFor([useLaunch()], { imports: [importOf('my.app.launch')] })).toEqual([]);
  });

  it('allows a CoroutineScope type that is not the kotlinx one', () => {
    expect(findingsFor([useLaunch()], { imports: [importOf('my.app.CoroutineScope')] })).toEqual(
      [],
    );
  });

  it('allows a file that declares its own use or launch', () => {
    expect(findingsFor([useLaunch()], { functions: [fn('use')] })).toEqual([]);
    expect(findingsFor([useLaunch()], { functions: [fn('launch')] })).toEqual([]);
  });

  it('reads files without use facts', () => {
    expect(run(childLifetimeFindings, [file()])).toEqual([]);
  });
});
