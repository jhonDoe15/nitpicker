import { describe, expect, it } from 'vitest';
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

function findingsFor(own, options = {}) {
  return run(unusedOptionFindings, own, { mentionedInJava: never, ...options });
}

function judged(own, options) {
  return summary(findingsFor(own, options));
}

const FLAGGED = [`${UNUSED_OPTION_RULE} format.pad 8`];

function messageWith(scope) {
  return (
    `Option format.pad is never set. Remove it, or set it from a real call (${scope}). If this is intended, ` +
    'add {"rule":"unused-option","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" ' +
    'in nitpicker.config.json.'
  );
}

describe('unused option on a public Kotlin function', () => {
  it('reports it in an unpublished module, where tests do not count', () => {
    const own = [file({ functions: [shared()], calls: [partial] }), testFile({ calls: [full] })];

    const findings = findingsFor(own);

    expect(summary(findings)).toEqual(FLAGGED);
    expect(findings[0].message).toBe(messageWith('tests do not count'));
  });

  it("counts the module's own tests when the module is published, but not another module's", () => {
    const own = [file({ functions: [shared()], calls: [partial] }), testFile({ calls: [full] })];
    const siblingTest = testFile({ file: OTHER_TESTS, calls: [full] });
    const alone = [file({ functions: [shared()], calls: [partial] })];

    expect(judged(own, { published: true })).toEqual([]);
    expect(judged(alone, { published: true, projectFiles: [...alone, siblingTest] })).toEqual(
      FLAGGED,
    );
    expect(findingsFor(alone, { published: true })[0].message).toBe(
      messageWith('tests of this published module count'),
    );
  });

  it('counts production calls in every module of the build', () => {
    const own = [file({ functions: [shared()], calls: [partial] })];
    const sibling = file({ file: OTHER_MODULE, calls: [full] });

    expect(judged(own, { projectFiles: [...own, sibling] })).toEqual([]);
    expect(
      judged(own, { projectFiles: [...own, file({ file: OTHER_MODULE, calls: [partial] })] }),
    ).toEqual(FLAGGED);
  });

  it('keeps private and internal declarations to calls in their own module, tests included', () => {
    const own = [
      file({ functions: [shared({ visibility: 'internal' })], calls: [partial] }),
      testFile({ calls: [full] }),
    ];
    const sibling = file({ file: OTHER_MODULE, calls: [full] });
    const alone = [file({ functions: [shared({ visibility: 'internal' })], calls: [partial] })];

    expect(judged(own)).toEqual([]);
    expect(judged(alone, { projectFiles: [...alone, sibling] })).toEqual(FLAGGED);
  });

  it.each([
    [
      'a function of an annotated class',
      'Service',
      [klass('Service', { annotations: [{ name: 'Service' }] })],
    ],
    [
      'a function of a companion of an annotated class',
      'Api.Companion',
      [
        klass('Api', { annotations: [{ name: 'RestController' }] }),
        klass('Companion', { qualified: 'Api.Companion', kind: 'companion' }),
      ],
    ],
    ['an interface member', 'Port', [klass('Port', { kind: 'interface' })]],
  ])('leaves %s alone', (_name, owner, classes) => {
    const own = [file({ classes, functions: [shared({ owner })], calls: [partial] })];

    expect(findingsFor(own)).toEqual([]);
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

  it('leaves a function alone when a callable reference or Java code anywhere in the build names it', () => {
    const own = [file({ functions: [shared()], calls: [partial] })];
    const referencing = file({ file: OTHER_MODULE, references: ['format'] });

    expect(findingsFor(own, { projectFiles: [...own, referencing] })).toEqual([]);
    expect(findingsFor(own, { mentionedInJava: (name) => name === 'format' })).toEqual([]);
  });
});

describe('unused option on a public Kotlin constructor', () => {
  const host = parameter('host', 'String', { property: 'val' });
  const retries = parameter('retries', 'Int', { default: true, line: 4 });
  const mailer = (overrides = {}) =>
    klass('Mailer', { primaryParameters: [host, retries], ...overrides });
  const constructed = [call('Mailer', { positional: 1 })];

  it('reports a default no production call fills, and a secondary constructor default', () => {
    const secondary = fn('<init>', { owner: 'Mailer', parameters: [host, retries], line: 6 });

    expect(judged([file({ classes: [mailer()], calls: constructed })])).toEqual([
      `${UNUSED_OPTION_RULE} Mailer.retries 4`,
    ]);
    expect(
      judged([file({ classes: [klass('Mailer')], functions: [secondary], calls: constructed })]),
    ).toEqual([`${UNUSED_OPTION_RULE} Mailer.retries 4`]);
  });

  it.each([
    ['a @JvmOverloads constructor', { constructorAnnotations: ['JvmOverloads'] }],
    ['an injected constructor', { constructorAnnotations: ['Autowired'] }],
    ['a Spring bean', { annotations: [{ name: 'Component' }] }],
    ['an open class', { open: true }],
  ])('leaves %s alone', (_name, overrides) => {
    expect(findingsFor([file({ classes: [mailer(overrides)], calls: constructed })])).toEqual([]);
  });

  it('leaves an annotated secondary constructor alone', () => {
    const secondary = fn('<init>', {
      owner: 'Mailer',
      annotations: ['JvmOverloads'],
      parameters: [host, retries],
    });

    expect(
      findingsFor([
        file({ classes: [klass('Mailer')], functions: [secondary], calls: constructed }),
      ]),
    ).toEqual([]);
  });

  it('leaves a class whose parameters are all properties alone when the module serializes classes', () => {
    const shaped = mailer({
      primaryParameters: [host, { ...retries, property: 'val' }],
    });
    const plain = mailer();

    expect(
      findingsFor([file({ classes: [shaped], calls: constructed })], { serialization: true }),
    ).toEqual([]);
    expect(
      judged([file({ classes: [plain], calls: constructed })], { serialization: true }),
    ).toEqual([`${UNUSED_OPTION_RULE} Mailer.retries 4`]);
  });

  it('leaves a class alone when a class literal names it', () => {
    const own = [file({ classes: [mailer()], calls: constructed, references: ['Mailer'] })];

    expect(findingsFor(own)).toEqual([]);
  });
});
