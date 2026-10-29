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
const TEST_CONFIGURATION = 'org.springframework.boot.test.context.TestConfiguration';
const SPRING_IMPORTS = [
  { path: 'org.springframework.stereotype.Service', all: false },
  { path: 'org.springframework.context.annotation', all: true },
];

function moduleOf(files, index, { manifest = {}, skipped = [] } = {}) {
  return {
    reportRoot: `module-${String(index)}`,
    path: `:m${String(index)}`,
    manifest,
    facts: { files, skipped },
  };
}

function buildOf(modules, { mentionedInJava = never } = {}) {
  return factsView({ modules, mentionedInJava });
}

function findingsFor(own, { siblings = [], published = false, gaps = [], build, index = 0 } = {}) {
  const view =
    build ??
    buildOf([
      moduleOf(own, 0, { manifest: { published, kotlinCallerGaps: gaps } }),
      ...siblings.map((files, offset) => moduleOf(files, offset + 1)),
    ]);
  return run(unusedOptionFindings, own, {
    mentionedInJava: never,
    build: view,
    reportRoot: `module-${String(index)}`,
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
    const mentioned = buildOf([moduleOf(own, 0)], { mentionedInJava: (name) => name === 'format' });

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

  it('judges the functions of a top-level object, a companion and an object without a Spring annotation', () => {
    const suppressed = klass('Formats', { kind: 'object', annotations: [{ name: 'Suppress' }] });
    const ownComponent = klass('Formats', { kind: 'object', annotations: [{ name: 'Component' }] });

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
    expect(
      judged([
        file({
          classes: [ownComponent],
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
      [klass('Formats', { kind: 'object', annotations: [{ name: 'Service', type: 'Service' }] })],
    ],
    [
      'a member of the companion of a configuration class',
      'Text.Companion',
      [klass('Text', { annotations: [{ name: 'Configuration' }] }), companion],
    ],
    [
      'a member of the companion of a fully qualified test configuration',
      'Text.Companion',
      [
        klass('Text', { annotations: [{ name: 'TestConfiguration', type: TEST_CONFIGURATION }] }),
        companion,
      ],
    ],
  ])('leaves %s alone', (_name, owner, classes) => {
    const own = [
      file({ imports: SPRING_IMPORTS, classes, functions: [shared({ owner })], calls: [partial] }),
    ];

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
  const own = [
    file({
      functions: [shared(), shared({ name: 'trim', visibility: 'private' })],
      calls: [partial, call('trim', { positional: 1 })],
    }),
  ];
  const other = [file({ file: OTHER_MODULE, functions: [shared({ line: 3 })], calls: [partial] })];
  const otherFlagged = [`${UNUSED_OPTION_RULE} format.pad 8`];
  const sourceSet = (tests) => ({
    label: 'the source set integration of :m0',
    tests,
    owner: ':m0',
    reaches: [':m0'],
  });

  it('notes, once and on the first public function, a gap that can call the module', () => {
    const build = buildOf([
      moduleOf(own, 0, { manifest: { kotlinCallerGaps: [sourceSet(false)] } }),
      moduleOf(other, 1),
    ]);

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
        'Public functions are not checked for unused options where these can call them: the facts ' +
        'do not cover the source set integration of :m0.',
    });
    expect(summary(findingsFor(other, { build, index: 1 }))).toEqual(otherFlagged);
  });

  it("ignores a test suite unless the module is published, since only a published module's tests count", () => {
    const tests = sourceSet(true);

    expect(judged(own, { gaps: [tests] })).toEqual([
      ...FLAGGED.map((entry) => entry.replace('format', 'trim')),
      ...FLAGGED,
    ]);
    expect(judged(own, { gaps: [tests], published: true })).toEqual([
      `${UNUSED_OPTION_RULE} trim.pad 8`,
      `${UNUSED_OPTION_RULE} callers-not-analyzed 8`,
    ]);
  });

  it('applies an included build or a skipped file only to the modules it can call', () => {
    const included = { label: 'the included build tools', reaches: [':m1'] };
    const build = buildOf([
      moduleOf(own, 0, { manifest: { kotlinCallerGaps: [included] } }),
      moduleOf(other, 1),
    ]);
    const skippedTest = buildOf([
      moduleOf(own, 0, { skipped: [{ file: 'src/test/kotlin/demo/DeepTest.kt', test: true }] }),
    ]);
    const skippedMain = buildOf([
      moduleOf(own, 0),
      moduleOf(other, 1, {
        manifest: { projectDependencies: [':m0'] },
        skipped: [{ file: 'billing/src/main/kotlin/demo/Deep.kt', test: false }],
      }),
    ]);

    expect(summary(findingsFor(own, { build }))).toEqual([
      `${UNUSED_OPTION_RULE} trim.pad 8`,
      ...FLAGGED,
    ]);
    expect(summary(findingsFor(other, { build, index: 1 }))).toEqual([
      `${UNUSED_OPTION_RULE} callers-not-analyzed 3`,
    ]);
    expect(summary(findingsFor(own, { build: skippedTest }))).toEqual([
      `${UNUSED_OPTION_RULE} trim.pad 8`,
      ...FLAGGED,
    ]);
    expect(summary(findingsFor(own, { build: skippedMain }))).toEqual([
      `${UNUSED_OPTION_RULE} trim.pad 8`,
    ]);
    expect(summary(findingsFor(other, { build: skippedMain, index: 1 }))).toEqual([
      `${UNUSED_OPTION_RULE} callers-not-analyzed 3`,
    ]);
  });

  it('anchors the note on the first public function of the build in path order', () => {
    const gap = { label: 'the included build tools', reaches: [':m0', ':m1'] };
    const build = buildOf([
      moduleOf(own, 0, { manifest: { kotlinCallerGaps: [gap] } }),
      moduleOf(other, 1),
    ]);

    expect(summary(findingsFor(own, { build }))).toEqual([`${UNUSED_OPTION_RULE} trim.pad 8`]);
    expect(summary(findingsFor(other, { build, index: 1 }))).toEqual([
      `${UNUSED_OPTION_RULE} callers-not-analyzed 3`,
    ]);
  });
});
