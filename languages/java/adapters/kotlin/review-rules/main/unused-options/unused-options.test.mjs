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
} from '../../test-support/facts.mjs';
import { UNUSED_OPTION_RULE, UNUSED_OPTION_TOOL, unusedOptionFindings } from './unused-options.mjs';

const options = [parameter('value', 'Int'), parameter('pad', 'Int', { default: true, line: 8 })];
const helper = (overrides = {}) =>
  fn('format', { visibility: 'private', parameters: options, line: 8, ...overrides });
const never = () => false;

function findingsFor(files, mentionedInJava = never) {
  return run(unusedOptionFindings, files, { mentionedInJava });
}

describe('unused option in Kotlin', () => {
  it('reports a private default parameter that no call fills, with the shared rule id and hint', () => {
    const findings = findingsFor([
      file({ functions: [helper()], calls: [call('format', { positional: 1 })] }),
    ]);

    expect(summary(findings)).toEqual([`${UNUSED_OPTION_RULE} format.pad 8`]);
    expect(findings[0]).toEqual({
      tool: UNUSED_OPTION_TOOL,
      rule: UNUSED_OPTION_RULE,
      path: 'src/main/kotlin/demo/Sample.kt',
      identity: 'unused-option:format.pad',
      symbol: 'format.pad',
      location: { line: 8 },
      message:
        'Option format.pad is never set. Remove it, or set it from a real call (private or internal, so calls in tests count). If this is intended, add {"rule":"unused-option","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      allowedForm:
        'Remove it, or set it from a real call (private or internal, so calls in tests count).',
      classification: 'enforceable',
    });
  });

  it.each([
    ['a positional argument', call('format', { positional: 2 })],
    ['a named argument', call('format', { positional: 1, named: ['pad'] })],
    ['a spread argument', call('format', { positional: 0, spread: true })],
  ])('allows a parameter set by %s', (_name, filling) => {
    const files = [
      file({ functions: [helper()], calls: [call('format', { positional: 1 }), filling] }),
    ];

    expect(findingsFor(files)).toEqual([]);
  });

  it('counts a call in a test file and a call through an import alias', () => {
    const inTest = testFile({ calls: [call('format', { positional: 2 })] });
    const aliased = file({
      file: 'src/main/kotlin/demo/Other.kt',
      imports: [{ path: 'demo.format', alias: 'fmt', all: false }],
      calls: [call('fmt', { positional: 2 })],
    });

    expect(
      findingsFor([
        file({ functions: [helper()], calls: [call('format', { positional: 1 })] }),
        inTest,
      ]),
    ).toEqual([]);
    expect(
      findingsFor([
        file({ functions: [helper()], calls: [call('format', { positional: 1 })] }),
        aliased,
      ]),
    ).toEqual([]);
  });

  it('reports only the parameters that the call leaves out', () => {
    const wide = helper({
      parameters: [...options, parameter('mark', 'Char', { default: true, line: 9 })],
    });
    const files = [
      file({ functions: [wide], calls: [call('format', { positional: 1, named: ['mark'] })] }),
    ];

    expect(summary(findingsFor(files))).toEqual([`${UNUSED_OPTION_RULE} format.pad 8`]);
  });

  it('counts a trailing lambda as the last parameter', () => {
    const withLambda = helper({
      parameters: [parameter('value', 'Int'), parameter('onDone', '() -> Unit', { default: true })],
    });

    expect(
      findingsFor([
        file({ functions: [withLambda], calls: [call('format', { positional: 1, lambda: true })] }),
      ]),
    ).toEqual([]);
  });

  it.each([
    ['an override', { modifiers: ['override'] }],
    ['an annotated function', { annotations: ['JvmOverloads'] }],
    ['an open function', { modifiers: ['open'] }],
  ])('leaves %s alone', (_name, overrides) => {
    const files = [
      file({ functions: [helper(overrides)], calls: [call('format', { positional: 1 })] }),
    ];

    expect(findingsFor(files)).toEqual([]);
  });

  it('leaves a function alone when nothing calls it, a callable reference names it, or Java mentions it', () => {
    expect(findingsFor([file({ functions: [helper()] })])).toEqual([]);
    expect(
      findingsFor([
        file({
          functions: [helper()],
          calls: [call('format', { positional: 1 })],
          references: ['format'],
        }),
      ]),
    ).toEqual([]);
    expect(
      findingsFor(
        [file({ functions: [helper()], calls: [call('format', { positional: 1 })] })],
        (name) => name === 'format',
      ),
    ).toEqual([]);
  });

  it('reports an internal class constructor default that no call fills', () => {
    const mailer = klass('Mailer', {
      visibility: 'internal',
      line: 3,
      primaryParameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true, line: 4 }),
      ],
    });
    const files = [file({ classes: [mailer], calls: [call('Mailer', { positional: 1 })] })];

    expect(summary(findingsFor(files))).toEqual([`${UNUSED_OPTION_RULE} Mailer.retries 4`]);
    expect(
      findingsFor([
        file({ classes: [mailer], calls: [call('Mailer', { positional: 1, named: ['retries'] })] }),
      ]),
    ).toEqual([]);
  });

  it('leaves public, annotated and open classes alone, and a subclass call counts', () => {
    const base = {
      visibility: 'internal',
      primaryParameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true }),
      ],
    };
    const calls = [call('Mailer', { positional: 1 })];

    expect(
      findingsFor([file({ classes: [klass('Mailer', { ...base, visibility: 'public' })], calls })]),
    ).toEqual([]);
    expect(
      findingsFor([
        file({
          classes: [
            klass('Mailer', { ...base, annotations: [{ name: 'Entity', text: '@Entity' }] }),
          ],
          calls,
        }),
      ]),
    ).toEqual([]);
    expect(
      findingsFor([file({ classes: [klass('Mailer', { ...base, open: true })], calls })]),
    ).toEqual([]);
    expect(
      findingsFor([
        file({ classes: [klass('Mailer', base)], calls: [call('Mailer', { positional: 2 })] }),
      ]),
    ).toEqual([]);
  });

  it('reports a private secondary constructor default that no call fills', () => {
    const mailer = klass('Mailer', { visibility: 'public' });
    const secondary = fn('<init>', {
      owner: 'Mailer',
      visibility: 'private',
      line: 6,
      parameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true, line: 6 }),
      ],
    });
    const files = [
      file({
        classes: [mailer],
        functions: [secondary],
        calls: [call('Mailer', { positional: 1 })],
      }),
    ];

    expect(summary(findingsFor(files))).toEqual([`${UNUSED_OPTION_RULE} Mailer.retries 6`]);
  });

  it('ignores declarations in test sources', () => {
    const files = [testFile({ functions: [helper()], calls: [call('format', { positional: 1 })] })];

    expect(findingsFor(files)).toEqual([]);
  });

  it('counts a call through a type alias as a call of the class', () => {
    const mailer = klass('Mailer', {
      visibility: 'internal',
      primaryParameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true }),
      ],
    });
    const files = [
      file({
        classes: [mailer],
        typeAliases: [{ name: 'Sender', target: 'Mailer' }],
        calls: [call('Sender', { positional: 2 })],
      }),
    ];

    expect(findingsFor(files)).toEqual([]);
  });

  it('counts a copy call with a named argument as setting that parameter of a data class', () => {
    const settings = klass('Settings', {
      data: true,
      visibility: 'internal',
      primaryParameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true }),
      ],
    });
    const plain = (calls) => [file({ classes: [settings], calls })];
    const construct = call('Settings', { positional: 1 });

    expect(findingsFor(plain([construct]))).toHaveLength(1);
    expect(findingsFor(plain([construct, call('copy', { named: ['retries'] })]))).toEqual([]);
    expect(findingsFor(plain([call('copy', { named: ['retries'] })]))).toEqual([]);
  });

  it('skips data classes when the module serializes Kotlin classes', () => {
    const settings = klass('Settings', {
      data: true,
      visibility: 'internal',
      primaryParameters: [
        parameter('host', 'String'),
        parameter('retries', 'Int', { default: true }),
      ],
    });
    const files = [file({ classes: [settings], calls: [call('Settings', { positional: 1 })] })];

    expect(findingsFor(files)).toHaveLength(1);
    expect(
      run(unusedOptionFindings, files, { mentionedInJava: never, serialization: true }),
    ).toEqual([]);
  });
});

describe('the calls that can reach a Kotlin function', () => {
  const pad = (overrides = {}) =>
    fn('pad', {
      visibility: 'internal',
      parameters: [parameter('text', 'String'), parameter('width', 'Int', { default: true })],
      ...overrides,
    });
  const declaring = (functions, classes = []) => file({ package: 'demo.text', functions, classes });
  const caller = (calls, overrides = {}) =>
    file({ file: 'src/main/kotlin/demo/app/App.kt', package: 'demo.app', calls, ...overrides });
  const setsWidth = (overrides = {}) =>
    call('pad', { positional: 1, named: ['width'], ...overrides });
  const plain = call('pad', { positional: 1 });

  it('does not count a call with a receiver for a top-level function that is not an extension', () => {
    const files = [declaring([pad()], []), caller([setsWidth({ qualifier: 'title' })])];
    files[0].calls = [plain];

    expect(summary(findingsFor(files))).toEqual([`${UNUSED_OPTION_RULE} pad.width 1`]);
  });

  it('does not count an unqualified call from a package that neither is nor imports the function', () => {
    const files = [declaring([pad()]), caller([setsWidth()])];
    files[0].calls = [plain];

    expect(summary(findingsFor(files))).toEqual([`${UNUSED_OPTION_RULE} pad.width 1`]);
  });

  it.each([
    ['an import of the function', { imports: [{ path: 'demo.text.pad', all: false }] }, {}],
    ['a star import of its package', { imports: [{ path: 'demo.text', all: true }] }, {}],
    ['the same package', { package: 'demo.text' }, {}],
    ['a package-qualified call', {}, { qualifier: 'demo.text' }],
  ])('counts a call through %s', (_name, callerOverrides, callOverrides) => {
    const files = [declaring([pad()]), caller([setsWidth(callOverrides)], callerOverrides)];
    files[0].calls = [plain];

    expect(findingsFor(files)).toEqual([]);
  });

  it('counts a call with any receiver for an extension that the caller imports', () => {
    const extension = pad({ receiver: 'String', parameters: [pad().parameters[1]] });
    const imported = { imports: [{ path: 'demo.text.pad', all: false }] };
    const files = [
      declaring([extension]),
      caller([call('pad', { named: ['width'], qualifier: 'title' })], imported),
    ];
    files[0].calls = [call('pad', { qualifier: '"x"' })];

    expect(findingsFor(files)).toEqual([]);
  });

  it('counts a call of an object member through any receiver but another type', () => {
    const texts = klass('Texts', { kind: 'object' });
    const member = pad({ owner: 'Texts' });
    const imported = { imports: [{ path: 'demo.text.Texts', all: false }] };
    const run = (qualifier, overrides = imported) => {
      const files = [declaring([member], [texts]), caller([setsWidth({ qualifier })], overrides)];
      files[0].calls = [call('pad', { positional: 1, qualifier: 'Texts' })];
      return findingsFor(files).length;
    };

    expect([
      run('Texts'),
      run('demo.text.Texts', {}),
      run('this'),
      run('this@Texts'),
      run('texts'),
      run(undefined, {}),
      run('Other'),
      run('demo.other.Texts'),
    ]).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
    expect(run('T', { imports: [{ path: 'demo.text.Texts', alias: 'T', all: false }] })).toBe(0);
    expect(run('U', { typeAliases: [{ name: 'U', target: 'Texts', line: 1 }] })).toBe(0);
    expect(run('Texts', {})).toBe(1);
  });

  it('counts a named companion through its class and a nested object through an aliased outer class', () => {
    const run = (owner, kind, qualifier) => {
      const files = [
        declaring(
          [pad({ owner })],
          [klass('Outer'), klass(owner.split('.')[1], { qualified: owner, kind })],
        ),
        caller([setsWidth({ qualifier })], {
          imports: [{ path: 'demo.text.Outer', alias: 'O', all: false }],
        }),
      ];
      files[0].calls = [call('pad', { positional: 1, qualifier: owner })];
      return findingsFor(files).length;
    };

    expect([
      run('Outer.Factory', 'companion', 'O'),
      run('Outer.Inner', 'object', 'O.Inner'),
      run('Outer.Inner', 'object', 'O.Other'),
    ]).toEqual([0, 0, 1]);
  });

  it('counts a call of a class member through any receiver', () => {
    const owner = klass('Formatter');
    const files = [
      declaring([pad({ owner: 'Formatter' })], [owner]),
      caller([setsWidth({ qualifier: 'formatter' })]),
    ];
    files[0].calls = [plain];

    expect(findingsFor(files)).toEqual([]);
  });
});
