import { describe, expect, it } from 'vitest';
import {
  fn,
  klass,
  parameter,
  property,
  routeOf,
  run,
  summary,
  testFile,
  testMethod,
} from '../test-support/facts.mjs';
import { SPRING_UNUSED_CONTEXT_RULE, springContextFindings } from './spring-context.mjs';

const IMPORT = {
  path: 'org.springframework.boot.test.context.SpringBootTest',
  all: false,
};
const bootTest = (...args) => ({ name: 'SpringBootTest', arguments: args });

function contextTest({ annotations = [bootTest()], ...rest } = {}) {
  const {
    properties = [],
    functions = [testMethod()],
    classOverrides = {},
    imports = [IMPORT],
  } = rest;
  return testFile({
    imports,
    classes: [klass('SampleTest', { annotations, ...classOverrides })],
    functions,
    properties,
  });
}

const findingsOf = (file) => run(springContextFindings, [file]);

describe('unused Spring test context in Kotlin', () => {
  it('reports a @SpringBootTest class that injects nothing, with the Java rule id and exception route', () => {
    const findings = findingsOf(contextTest());

    expect(summary(findings)).toEqual([`${SPRING_UNUSED_CONTEXT_RULE} SampleTest 1`]);
    expect(findings[0].tool).toBe('pmd');
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/SpringUnusedContext","paths":["src/test/kotlin/demo/SampleTest.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    [
      'an @Autowired property',
      { properties: [property('service', 'SampleTest', { annotations: ['Autowired'] })] },
    ],
    [
      'a lateinit property',
      { properties: [property('service', 'SampleTest', { lateinit: true })] },
    ],
    ['a MockMvc property', { properties: [property('mvc', 'SampleTest', { type: 'MockMvc' })] }],
    [
      'a WebTestClient property',
      { properties: [property('client', 'SampleTest', { type: 'WebTestClient?' })] },
    ],
    [
      'a @MockBean property',
      { properties: [property('repo', 'SampleTest', { annotations: ['MockBean'] })] },
    ],
    [
      'a @LocalServerPort property',
      { properties: [property('port', 'SampleTest', { annotations: ['LocalServerPort'] })] },
    ],
    [
      'a constructor parameter',
      { classOverrides: { primaryParameters: [parameter('service', 'Service')] } },
    ],
    [
      'a secondary constructor with parameters',
      {
        functions: [
          testMethod(),
          fn('<init>', { owner: 'SampleTest', parameters: [parameter('service', 'Service')] }),
        ],
      },
    ],
    [
      'an injected test method parameter',
      {
        functions: [
          fn('waits', {
            owner: 'SampleTest',
            annotations: ['Test'],
            parameters: [parameter('output', 'CapturedOutput')],
          }),
        ],
      },
    ],
    ['a class-level @MockBean', { annotations: [bootTest(), { name: 'MockBean', arguments: [] }] }],
    [
      'a web environment with a port',
      {
        annotations: [
          bootTest(
            { name: 'properties', text: '["a=b"]' },
            { name: 'webEnvironment', text: 'WebEnvironment.RANDOM_PORT' },
          ),
        ],
      },
    ],
    ['a superclass', { classOverrides: { superCall: true, supers: ['BaseTest'] } }],
  ])('allows %s', (_name, options) => {
    expect(findingsOf(contextTest(options))).toEqual([]);
  });

  it("allows a context test without a test method body, and an annotation that is not Spring Boot's", () => {
    const emptyBody = contextTest({
      functions: [fn('waits', { owner: 'SampleTest', annotations: ['Test'], emptyBody: true })],
    });
    const other = contextTest({ imports: [] });

    expect([...findingsOf(emptyBody), ...findingsOf(other)]).toEqual([]);
  });

  it('counts the injection of a nested class towards the outer class', () => {
    const file = testFile({
      imports: [IMPORT],
      classes: [
        klass('SampleTest', { annotations: [bootTest()] }),
        klass('Inner', { qualified: 'SampleTest.Inner' }),
      ],
      functions: [testMethod(), fn('check', { owner: 'SampleTest.Inner', annotations: ['Test'] })],
      properties: [property('service', 'SampleTest.Inner', { annotations: ['Autowired'] })],
    });

    expect(findingsOf(file)).toEqual([]);
  });

  it('ignores main sources', () => {
    const file = { ...contextTest(), test: false };

    expect(findingsOf(file)).toEqual([]);
  });
});
