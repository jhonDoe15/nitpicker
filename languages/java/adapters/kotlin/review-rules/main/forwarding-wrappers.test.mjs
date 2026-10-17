import { describe, expect, it } from 'vitest';
import { argument, file, fn, klass, parameter, run, summary } from '../test-support/facts.mjs';
import { FORWARDING_RULE, forwardingWrapperFindings } from './forwarding-wrappers.mjs';

const forward = (name, args, overrides = {}) => ({
  name,
  qualifier: null,
  typeArguments: false,
  arguments: args.map((text) => argument(text)),
  ...overrides,
});
const params = (...names) => names.map((name) => parameter(name, 'Int'));
const target = (name = 'scaled', overrides = {}) =>
  fn(name, { parameters: params('cents'), returnType: 'Int', ...overrides });
const wrapper = (overrides = {}) =>
  fn('price', { line: 3, parameters: params('cents'), forward: forward('scaled', ['cents']), ...overrides });

const findingsFor = (functions, classes = []) =>
  run(forwardingWrapperFindings, [file({ functions, classes })]);

describe('forwarding wrapper in Kotlin', () => {
  it('reports a top-level function that only passes its parameter to a same-signature function', () => {
    const findings = findingsFor([wrapper(), target()]);

    expect(summary(findings)).toEqual([`${FORWARDING_RULE} price 3`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toContain('add an exception for pmd/StaticForwardingWrapper in nitpicker.config.json');
  });

  it('reports an object member that forwards to an object member through its type name', () => {
    const util = klass('Util', { kind: 'object' });
    const twice = fn('twice', {
      owner: 'Util',
      parameters: params('a', 'b'),
      forward: forward('add', ['a', 'b'], { qualifier: 'Util' }),
    });
    const add = fn('add', { owner: 'Util', parameters: params('a', 'b') });

    expect(summary(findingsFor([twice, add], [util]))).toEqual([`${FORWARDING_RULE} Util.twice 1`]);
  });

  it.each([
    ['arguments in another order', { parameters: params('a', 'b'), forward: forward('scaled2', ['b', 'a']) }],
    ['an extra argument', { forward: forward('scaled', ['cents', '1']) }],
    ['a changed argument', { forward: forward('scaled', ['cents * 2']) }],
    ['a call on an instance', { forward: forward('scaled', ['cents'], { qualifier: 'helper' }) }],
    ['a call to itself', { forward: forward('price', ['cents']) }],
    ['a factory named of', { name: 'of' }],
    ['a copy', { forward: forward('copyOf', ['cents']) }],
    ['a default parameter', { parameters: [parameter('cents', 'Int', { default: true })] }],
    ['a type parameter', { typeParameters: true }],
    ['an annotation', { annotations: ['JvmStatic'] }],
    ['an override', { modifiers: ['override'] }],
    ['an extension receiver', { receiver: 'String' }],
    ['a call with type arguments', { forward: forward('scaled', ['cents'], { typeArguments: true }) }],
    ['a spread argument', { forward: { ...forward('scaled', ['cents']), arguments: [argument('cents', { spread: true })] } }],
    ['no body call', { forward: null }],
  ])('allows %s', (_name, overrides) => {
    const functions = [
      wrapper(overrides),
      target(),
      target('scaled2', { parameters: params('a', 'b') }),
    ];

    expect(findingsFor(functions)).toEqual([]);
  });

  it('allows a function whose target has other parameter types or is not in the project', () => {
    const other = target('scaled', { parameters: [parameter('cents', 'Long')] });

    expect(findingsFor([wrapper(), other])).toEqual([]);
    expect(findingsFor([wrapper()])).toEqual([]);
  });

  it('allows a member of a class and of a Spring-annotated object', () => {
    const service = klass('Prices', { kind: 'object', annotations: [{ name: 'Component', text: '@Component' }] });
    const member = wrapper({ owner: 'Prices' });
    const sibling = target('scaled', { owner: 'Prices' });
    const plain = klass('Holder');
    const inClass = wrapper({ owner: 'Holder' });

    expect(findingsFor([member, sibling], [service])).toEqual([]);
    expect(findingsFor([inClass, target()], [plain])).toEqual([]);
  });

  it('ignores test sources', () => {
    const files = [file({ file: 'src/test/kotlin/demo/A.kt', test: true, functions: [wrapper(), target()] })];

    expect(run(forwardingWrapperFindings, files)).toEqual([]);
  });
});
