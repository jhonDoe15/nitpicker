import { describe, expect, it } from 'vitest';
import { factsView } from '../build-view.mjs';
import {
  call,
  file,
  fn,
  klass,
  parameter,
  run,
  summary,
  testFile,
} from '../test-support/facts.mjs';
import { UNUSED_OPTION_RULE, unusedOptionFindings } from './unused-options.mjs';

const OTHER_MODULE = 'billing/src/main/kotlin/demo/Billing.kt';
const OTHER_TESTS = 'billing/src/test/kotlin/demo/BillingTest.kt';
const options = [parameter('value', 'Int'), parameter('pad', 'Int', { default: true, line: 8 })];
const shared = (overrides = {}) => fn('format', { parameters: options, line: 8, ...overrides });
const partial = call('format', { positional: 1 });
const full = call('format', { positional: 2 });
const never = () => false;
const FLAGGED = [`${UNUSED_OPTION_RULE} format.pad 8`];

function buildOf(modules, { gaps = [], skipped = [], mentionedInJava = never } = {}) {
  return factsView({
    facts: new Map(modules.map((files, index) => [`module-${String(index)}`, { files, skipped }])),
    manifests: [{ kotlinCallerGaps: gaps }],
    mentionedInJava,
  });
}

function findingsFor(own, { siblings = [], published = false, build } = {}) {
  return run(unusedOptionFindings, own, {
    mentionedInJava: never,
    published,
    build: build ?? buildOf([own, ...siblings]),
  });
}

function judged(own, settings) {
  return summary(findingsFor(own, settings));
}

function messageWith(symbol, scope) {
  return (
    `Option ${symbol} is never set. Remove it, or set it from a real call (${scope}). If this is intended, ` +
    'add {"rule":"unused-option","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" ' +
    'in nitpicker.config.json.'
  );
}

describe('unused option on a public top-level Kotlin function', () => {
  it('reports it in an unpublished module, where tests do not count', () => {
    const own = [file({ functions: [shared()], calls: [partial] }), testFile({ calls: [full] })];

    const findings = findingsFor(own);

    expect(summary(findings)).toEqual(FLAGGED);
    expect(findings[0].message).toBe(messageWith('format.pad', 'tests do not count'));
  });

  it("counts the module's own tests when the module is published, but not another module's", () => {
    const own = [file({ functions: [shared()], calls: [partial] }), testFile({ calls: [full] })];
    const alone = [file({ functions: [shared()], calls: [partial] })];
    const siblingTest = [testFile({ file: OTHER_TESTS, calls: [full] })];

    expect(judged(own, { published: true })).toEqual([]);
    expect(judged(alone, { published: true, siblings: [siblingTest] })).toEqual(FLAGGED);
    expect(findingsFor(alone, { published: true })[0].message).toBe(
      messageWith('format.pad', "this module's own tests count"),
    );
  });

  it('counts production calls in every module of the build', () => {
    const own = [file({ functions: [shared()], calls: [partial] })];

    expect(judged(own, { siblings: [[file({ file: OTHER_MODULE, calls: [full] })]] })).toEqual([]);
    expect(judged(own, { siblings: [[file({ file: OTHER_MODULE, calls: [partial] })]] })).toEqual(
      FLAGGED,
    );
  });

  it('leaves it alone when a callable reference or Java code anywhere in the build names it', () => {
    const own = [file({ functions: [shared()], calls: [partial] })];
    const referencing = [testFile({ file: OTHER_TESTS, references: ['format'] })];
    const mentioned = buildOf([own], { mentionedInJava: (name) => name === 'format' });

    expect(findingsFor(own, { siblings: [referencing] })).toEqual([]);
    expect(findingsFor(own, { build: mentioned })).toEqual([]);
  });

  it.each([
    ['an override', { modifiers: ['override'] }],
    ['a @JvmOverloads function', { annotations: ['JvmOverloads'] }],
    ['a @Bean factory', { annotations: ['Bean'] }],
    ['a main function', { name: 'main' }],
  ])('leaves %s alone', (_name, overrides) => {
    const own = [file({ functions: [shared(overrides)], calls: [partial, call('main')] })];

    expect(findingsFor(own)).toEqual([]);
  });
});

describe('which public Kotlin declarations are judged', () => {
  const top = klass('Formats', { kind: 'object' });
  const host = klass('Text');
  const companion = klass('Companion', { qualified: 'Text.Companion', kind: 'companion' });

  it('judges the functions of a top-level object, a companion and an object with a plain annotation', () => {
    const suppressed = klass('Formats', { kind: 'object', annotations: [{ name: 'Suppress' }] });

    expect(
      judged([
        file({ classes: [top], functions: [shared({ owner: 'Formats' })], calls: [partial] }),
      ]),
    ).toEqual([`${UNUSED_OPTION_RULE} Formats.format.pad 8`]);
    expect(
      judged([
        file({
          classes: [host, companion],
          functions: [shared({ owner: 'Text.Companion' })],
          calls: [partial],
        }),
      ]),
    ).toEqual([`${UNUSED_OPTION_RULE} Text.Companion.format.pad 8`]);
    expect(
      judged([
        file({
          classes: [suppressed],
          functions: [shared({ owner: 'Formats' })],
          calls: [partial],
        }),
      ]),
    ).toEqual([`${UNUSED_OPTION_RULE} Formats.format.pad 8`]);
  });

  it.each([
    ['a member of a class', 'Text', [host]],
    [
      'a member of a nested object',
      'Text.Inner',
      [host, klass('Inner', { qualified: 'Text.Inner', kind: 'object' })],
    ],
    [
      'a member of a Spring bean object',
      'Formats',
      [klass('Formats', { kind: 'object', annotations: [{ name: 'Service' }] })],
    ],
    [
      'a member of the companion of a configuration class',
      'Text.Companion',
      [klass('Text', { annotations: [{ name: 'Configuration' }] }), companion],
    ],
  ])('leaves %s alone', (_name, owner, classes) => {
    const own = [file({ classes, functions: [shared({ owner })], calls: [partial] })];

    expect(findingsFor(own)).toEqual([]);
  });

  it('leaves public constructors alone: data classes and classes bound from configuration', () => {
    const retries = parameter('retries', 'Int', { default: true, property: 'val' });
    const request = klass('Request', { data: true, primaryParameters: [parameter('id'), retries] });
    const bound = klass('Retry', {
      qualified: 'QueueProperties.Retry',
      primaryParameters: [retries],
    });
    const own = [
      file({
        classes: [request, bound],
        calls: [call('Request', { positional: 1 }), call('Retry')],
      }),
    ];

    expect(findingsFor(own)).toEqual([]);
  });
});

describe('unused option when callers are hidden from the facts', () => {
  it('notes once that public functions are not judged, and still judges private ones', () => {
    const build = buildOf([], { gaps: ['the source set integrationTest of :app'] });
    const own = [
      file({
        functions: [shared(), shared({ name: 'trim', visibility: 'private' })],
        calls: [partial, call('trim', { positional: 1 })],
      }),
    ];

    const first = findingsFor(own, { build });

    expect(summary(first)).toEqual([
      `${UNUSED_OPTION_RULE} trim.pad 8`,
      `${UNUSED_OPTION_RULE} callers-not-analyzed 8`,
    ]);
    expect(first[1]).toEqual({
      tool: 'structure',
      rule: UNUSED_OPTION_RULE,
      path: 'src/main/kotlin/demo/Sample.kt',
      identity: 'unused-option:callers-not-analyzed',
      symbol: 'callers-not-analyzed',
      location: { line: 8 },
      classification: 'descriptive',
      message:
        'Public functions are not checked for unused options: the facts do not cover the source set ' +
        'integrationTest of :app, so calls there are not seen.',
    });
    expect(summary(findingsFor(own, { build }))).toEqual([`${UNUSED_OPTION_RULE} trim.pad 8`]);
  });

  it('counts a file the facts step skipped as hidden callers', () => {
    const own = [file({ functions: [shared()], calls: [partial] })];
    const build = buildOf([own], { skipped: ['src/main/kotlin/demo/Deep.kt'] });

    expect(build.gaps).toEqual(['the skipped file src/main/kotlin/demo/Deep.kt']);
    expect(summary(findingsFor(own, { build }))).toEqual([
      `${UNUSED_OPTION_RULE} callers-not-analyzed 8`,
    ]);
  });
});
