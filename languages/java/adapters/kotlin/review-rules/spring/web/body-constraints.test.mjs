import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../review-finding.mjs';
import { file, fn, importOf, klass, parameter } from '../../test-support/facts.mjs';
import { springFindings } from '../spring-findings.mjs';

const IMPORTS = [
  importOf('org.springframework.web.bind.annotation', { all: true }),
  importOf('jakarta.validation.constraints', { all: true }),
  importOf('jakarta.validation.Valid'),
];

function entry(name) {
  return { name, type: name, arguments: [] };
}

function member(name, type, annotations = []) {
  return parameter(name, type, {
    property: 'val',
    annotations,
    annotationEntries: annotations.map(entry),
  });
}

function dto(name, members, overrides = {}) {
  return klass(name, { primaryParameters: members, ...overrides });
}

function sourceFile(classes, bodyType) {
  return file({
    imports: IMPORTS,
    classes: [...classes, klass('Api')],
    functions: [
      fn('create', {
        owner: 'Api',
        annotations: ['PostMapping'],
        annotationEntries: [entry('PostMapping')],
        parameters: [
          parameter('body', bodyType, {
            line: 7,
            annotations: ['RequestBody'],
            annotationEntries: [entry('RequestBody')],
          }),
        ],
      }),
    ],
    scopes: [],
    invocations: [],
    locals: [],
    catches: [],
    literals: [],
    nullReturns: [],
    exceptionUses: [],
    throws: [],
  });
}

function reported(classes, bodyType) {
  const files = [sourceFile(classes, bodyType)];
  return springFindings(files, {
    finding: findingFactory(),
    manifest: { spring: true },
    projectFiles: files,
    projectRoot: '/nonexistent',
    javaRoots: [],
  }).some(({ rule }) => rule === 'SpringValidRequestBody');
}

describe('SpringValidRequestBody on the constraints of the body type', () => {
  it('reports a project type that declares a constraint', () => {
    expect(reported([dto('Order', [member('sku', 'String', ['NotBlank'])])], 'Order')).toBe(true);
  });

  it('reports a list of such a type', () => {
    expect(reported([dto('Order', [member('sku', 'String', ['Size'])])], 'List<Order>')).toBe(true);
  });

  it('leaves out a project type without constraints', () => {
    expect(reported([dto('Order', [member('sku', 'String')])], 'Order')).toBe(false);
  });

  it('reports a constraint that sits on a type reached by @Valid', () => {
    const classes = [
      dto('Order', [member('line', 'Line', ['Valid'])]),
      dto('Line', [member('sku', 'String', ['NotNull'])]),
    ];
    expect(reported(classes, 'Order')).toBe(true);
  });

  it('leaves out a nested type that has constraints but is not reached by @Valid', () => {
    const classes = [
      dto('Order', [member('line', 'Line')]),
      dto('Line', [member('sku', 'String', ['NotNull'])]),
    ];
    expect(reported(classes, 'Order')).toBe(false);
  });

  it('reports a constraint inherited from a project supertype', () => {
    const classes = [
      dto('Order', [], { supers: ['Base'] }),
      dto('Base', [member('id', 'Long', ['NotNull'])], { open: true }),
    ];
    expect(reported(classes, 'Order')).toBe(true);
  });

  it('keeps a type whose source is not in the project', () => {
    expect(reported([], 'Registration')).toBe(true);
  });

  it('keeps an interface, whose implementations may carry constraints', () => {
    expect(reported([dto('Shape', [], { kind: 'interface' })], 'Shape')).toBe(true);
  });
});
