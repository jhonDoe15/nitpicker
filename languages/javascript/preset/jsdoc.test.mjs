import { describe, expect, it } from 'vitest';
import {
  castTags,
  isJsdocBlock,
  parseJsdoc,
  typePredicateTags,
  unknownMemberTags,
  withJsdoc,
} from './jsdoc.mjs';

function messageIds(value) {
  return parseJsdoc(value).problems.map((problem) => problem.messageId);
}

describe('isJsdocBlock', () => {
  it('accepts a block comment that starts with an asterisk', () => {
    expect(isJsdocBlock({ type: 'Block', value: '* @type {string} ' })).toBe(true);
  });

  it('rejects a plain block comment and a line comment', () => {
    expect(isJsdocBlock({ type: 'Block', value: ' note ' })).toBe(false);
    expect(isJsdocBlock({ type: 'Line', value: '* note' })).toBe(false);
  });
});

describe('parseJsdoc tags', () => {
  it('reads types and names of every supported tag', () => {
    const { tags, problems } = parseJsdoc(
      [
        '*',
        ' * @param {string} name',
        ' * @param {number} [count]',
        ' * @property {boolean} flag',
        ' * @prop {boolean} other',
        ' * @typedef {{ id: string }} Row',
        ' * @returns {Promise<void>}',
        ' * @return {void}',
        ' * @type {Map<string, number>}',
        ' * @satisfies {Row}',
        ' * @extends {Base<string>}',
        ' * @augments {Base<number>}',
        ' * @this {Row}',
        ' * @callback Handler',
        ' * @template {object} T',
        ' * @template A, B',
        " * @import {Row} from './row.js'",
        ' * @overload',
        ' ',
      ].join('\n'),
    );
    expect(problems).toEqual([]);
    expect(tags).toEqual([
      { tag: 'param', type: 'string', name: 'name' },
      { tag: 'param', type: 'number', name: '[count]' },
      { tag: 'property', type: 'boolean', name: 'flag' },
      { tag: 'prop', type: 'boolean', name: 'other' },
      { tag: 'typedef', type: '{ id: string }', name: 'Row' },
      { tag: 'returns', type: 'Promise<void>' },
      { tag: 'return', type: 'void' },
      { tag: 'type', type: 'Map<string, number>' },
      { tag: 'satisfies', type: 'Row' },
      { tag: 'extends', type: 'Base<string>' },
      { tag: 'augments', type: 'Base<number>' },
      { tag: 'this', type: 'Row' },
      { tag: 'callback', name: 'Handler' },
      { tag: 'template', type: 'object', name: 'T' },
      { tag: 'template', name: 'A, B' },
      { tag: 'import' },
      { tag: 'overload' },
    ]);
  });

  it('keeps nested braces inside the type', () => {
    expect(parseJsdoc('* @param {{ a: { b: string } }} value').tags).toEqual([
      { tag: 'param', type: '{ a: { b: string } }', name: 'value' },
    ]);
  });

  it('accepts a type on the following line of a multi-line tag', () => {
    expect(messageIds('*\n * @param {string}\n *   name\n ')).toEqual([]);
  });

  it('accepts a namespace import', () => {
    expect(messageIds("* @import * as row from 'row'")).toEqual([]);
    expect(messageIds('* @import {a, b} from "row"')).toEqual([]);
  });
});

describe('parseJsdoc problems', () => {
  it('reports prose before the first tag once', () => {
    expect(messageIds('*\n * Adds two numbers.\n * @param {number} a\n ')).toEqual(['jsdocProse']);
  });

  it('reports prose after a tag once', () => {
    expect(messageIds('* @param {number} a the first\n * @param {number} b the second')).toEqual([
      'jsdocProse',
    ]);
  });

  it('reports an unsupported tag by name', () => {
    expect(parseJsdoc('* @enum {string}').problems).toEqual([
      { messageId: 'jsdocUnsupportedTag', data: { tag: 'enum' } },
    ]);
    expect(messageIds('* @throws {Error}')).toEqual(['jsdocUnsupportedTag']);
  });

  it('reports a tag without its type as malformed with its usage', () => {
    expect(parseJsdoc('* @param name').problems).toEqual([
      { messageId: 'jsdocMalformed', data: { tag: 'param', usage: '@param {Type} name' } },
    ]);
    expect(parseJsdoc('* @returns').problems).toEqual([
      { messageId: 'jsdocMalformed', data: { tag: 'returns', usage: '@returns {Type}' } },
    ]);
    expect(parseJsdoc('* @callback').problems).toEqual([
      { messageId: 'jsdocMalformed', data: { tag: 'callback', usage: '@callback Name' } },
    ]);
  });

  it('reports an unclosed type brace as malformed', () => {
    expect(messageIds('* @type {string')).toEqual(['jsdocMalformed']);
  });

  it('reports a malformed import', () => {
    expect(messageIds('* @import {Row}')).toEqual(['jsdocMalformed']);
  });

  it('reports any and the star type', () => {
    expect(messageIds('* @param {any} value')).toEqual(['jsdocAnyType']);
    expect(messageIds('* @param {*} value')).toEqual(['jsdocAnyType']);
    expect(messageIds('* @returns {Array<any>}')).toEqual(['jsdocAnyType']);
    expect(messageIds('* @returns {Promise<any>}')).toEqual(['jsdocAnyType']);
  });

  it('reports null inside a type', () => {
    expect(messageIds('* @returns {string | null}')).toEqual(['jsdocNullType']);
    expect(messageIds('* @param {Map<string, null>} value')).toEqual(['jsdocNullType']);
  });

  it('reports the nullable shorthands like null and a bare ? like any', () => {
    for (const type of [
      '?string',
      'string?',
      'Array<?string>',
      '{ a: ?string }',
      'string? | number',
    ]) {
      expect(messageIds(`* @param {${type}} value`), type).toEqual(['jsdocNullType']);
    }
    expect(messageIds('* @param {?} value')).toEqual(['jsdocAnyType']);
    expect(messageIds('* @returns {Promise<?>}')).toEqual(['jsdocAnyType']);
  });

  it('accepts optional members, optional tuple elements and conditional types', () => {
    for (const type of [
      '{ a?: string }',
      '(a?: number) => void',
      '[string, number?]',
      'T extends string ? 1 : 2',
      "'?' | '?x'",
    ]) {
      expect(messageIds(`* @param {${type}} value`), type).toEqual([]);
    }
  });

  it('reports each distinct problem once', () => {
    expect(messageIds('* @param {any} a\n * @param {any} b')).toEqual(['jsdocAnyType']);
    expect(messageIds('* @param {any} a\n * @param {null} b')).toEqual([
      'jsdocAnyType',
      'jsdocNullType',
    ]);
  });

  it('does not mistake words that merely contain any or null', () => {
    expect(messageIds('* @param {Company} value')).toEqual([]);
    expect(messageIds('* @param {nullable.Thing} value')).toEqual([]);
    expect(messageIds('* @param {ns.any} value')).toEqual([]);
    expect(messageIds('* @param {{ any: string }} value')).toEqual([]);
    expect(messageIds('* @param {{ null?: string }} value')).toEqual([]);
    expect(messageIds('* @param {$any} value')).toEqual([]);
  });

  it('ignores any and null inside string literals', () => {
    expect(messageIds("* @param {'any' | 'null' | \"*\"} value")).toEqual([]);
  });

  it('reports nothing for an empty comment', () => {
    expect(parseJsdoc('*').problems).toEqual([]);
    expect(parseJsdoc('*\n *\n ').tags).toEqual([]);
  });
});

describe('castTags', () => {
  it('selects @type tags except const', () => {
    const { tags } = parseJsdoc('* @type {Row}');
    expect(castTags(tags)).toEqual([{ tag: 'type', type: 'Row' }]);
    expect(castTags(parseJsdoc('* @type {const}').tags)).toEqual([]);
    expect(castTags(parseJsdoc('* @param {Row} row').tags)).toEqual([]);
  });
});

describe('unknownMemberTags', () => {
  function selected(value) {
    return unknownMemberTags(parseJsdoc(value).tags).map((tag) => tag.tag);
  }

  it('selects param, property and prop types that mention unknown', () => {
    expect(selected('* @param {unknown} value')).toEqual(['param']);
    expect(selected('* @property {unknown[]} items')).toEqual(['property']);
    expect(selected('* @prop {Array<unknown>} items')).toEqual(['prop']);
    expect(selected('* @param {Record<string, unknown>} bag')).toEqual(['param']);
  });

  it('selects an object typedef with an unknown member only', () => {
    expect(selected('* @typedef {{ value: unknown }} Row')).toEqual(['typedef']);
    expect(selected('* @typedef {unknown} Opaque')).toEqual([]);
    expect(selected('* @typedef {Array<unknown>} Rows')).toEqual([]);
  });

  it('allows an unknown caught error or cause slot', () => {
    expect(selected('* @param {unknown} cause')).toEqual([]);
    expect(selected('* @param {unknown} error')).toEqual([]);
    expect(selected('* @param {unknown[]} error')).toEqual(['param']);
    expect(selected('* @param {unknown} reason')).toEqual(['param']);
  });

  it('selects unknown inside an object type or function parameter of any type tag', () => {
    expect(selected('* @returns {{ readonly a: unknown }}')).toEqual(['returns']);
    expect(selected('* @return {Promise<{ a: unknown }>}')).toEqual(['return']);
    expect(selected('* @type {{ a: Array<unknown> }}')).toEqual(['type']);
    expect(selected('* @typedef {Readonly<{ readonly a: unknown }>} Wrapped')).toEqual(['typedef']);
    expect(selected('* @returns {(value: unknown) => void}')).toEqual(['returns']);
  });

  it('ignores return types, plain types and unknown used only as a key', () => {
    expect(selected('* @returns {unknown}')).toEqual([]);
    expect(selected('* @returns {Promise<unknown>}')).toEqual([]);
    expect(selected('* @type {unknown}')).toEqual([]);
    expect(selected('* @template {unknown} T')).toEqual([]);
    expect(selected('* @returns {{ unknown: string }}')).toEqual([]);
    expect(selected('* @param {{ unknown: string }} value')).toEqual([]);
    expect(selected('* @param {Known} value')).toEqual([]);
    expect(selected('* @param {unknownish} value')).toEqual([]);
  });
});

describe('typePredicateTags', () => {
  function selected(value) {
    return typePredicateTags(parseJsdoc(value).tags).map((tag) => tag.tag);
  }

  it('selects a returned type predicate or assertion', () => {
    expect(selected('* @returns {value is string}')).toEqual(['returns']);
    expect(selected('* @return {value is string}')).toEqual(['return']);
    expect(selected('* @returns {asserts value}')).toEqual(['returns']);
    expect(selected('* @returns {asserts value is Row}')).toEqual(['returns']);
    expect(selected('* @returns {asserts   value   is   Row}')).toEqual(['returns']);
  });

  it('ignores ordinary return types and other tags', () => {
    expect(selected('* @returns {boolean}')).toEqual([]);
    expect(selected('* @returns {Promise<void>}')).toEqual([]);
    expect(selected('* @type {value is string}')).toEqual([]);
    expect(selected('* @returns {isolated}')).toEqual([]);
    expect(selected('* @returns {x is}')).toEqual([]);
  });
});

describe('withJsdoc', () => {
  function recordingContext(options, value) {
    const reports = [];
    const comment = { type: 'Block', value, loc: { line: 3 } };
    const lineComment = { type: 'Line', value: '* @param {unknown} value', loc: { line: 9 } };
    return {
      reports,
      context: {
        options,
        sourceCode: { getAllComments: () => [lineComment, comment] },
        report: (report) => reports.push(report),
      },
    };
  }

  const selection = { selectTags: unknownMemberTags, messageId: 'unknownType' };

  it('returns the visitors unchanged unless the jsdoc option is true', () => {
    const visitors = { Identifier() {} };
    expect(withJsdoc(recordingContext([], '*').context, visitors, selection)).toBe(visitors);
    expect(withJsdoc(recordingContext([{}], '*').context, visitors, selection)).toBe(visitors);
    expect(withJsdoc(recordingContext([{ jsdoc: false }], '*').context, visitors, selection)).toBe(
      visitors,
    );
  });

  it('keeps the visitors and reports selected jsdoc blocks at the comment', () => {
    const { context, reports } = recordingContext([{ jsdoc: true }], '* @param {unknown} value');
    const visitors = { Identifier() {} };
    const combined = withJsdoc(context, visitors, selection);
    expect(Object.keys(combined)).toEqual(['Identifier', 'Program']);
    combined.Program();
    expect(reports).toEqual([{ loc: { line: 3 }, messageId: 'unknownType' }]);
  });

  it('reports nothing when no tag is selected', () => {
    const { context, reports } = recordingContext([{ jsdoc: true }], '* @param {string} value');
    withJsdoc(context, {}, selection).Program();
    expect(reports).toEqual([]);
  });
});
