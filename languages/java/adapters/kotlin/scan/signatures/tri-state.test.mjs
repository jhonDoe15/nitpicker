import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { triStateBooleans } from './tri-state.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return triStateBooleans(scanned).map((reported) => [
    reported.rule,
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

describe('triStateBooleans', () => {
  it.each([
    ['a parameter', 'fun run(force: Boolean?) {}\n', [['TriStateBoolean', 1, 'run(force)']]],
    [
      'a parameter with a default',
      'fun run(name: String, force: Boolean? = null) {}\n',
      [['TriStateBoolean', 1, 'run(force)']],
    ],
    ['a return type', 'fun find(): Boolean? = null\n', [['TriStateBoolean', 1, 'find()']]],
    [
      'a constructor property',
      'data class Options(val verbose: Boolean?, val quiet: Boolean)\n',
      [['TriStateBoolean', 1, 'Options(verbose)']],
    ],
    [
      'a class property',
      'class Check {\n    var enabled: Boolean? = null\n}\n',
      [['TriStateBoolean', 2, 'enabled']],
    ],
    ['a top-level property', 'val seen: Boolean? = null\n', [['TriStateBoolean', 1, 'seen']]],
    [
      'a secondary constructor',
      'class Check {\n    constructor(force: Boolean?)\n}\n',
      [['TriStateBoolean', 2, 'constructor(force)']],
    ],
  ])('flags %s', (_name, source, expected) => {
    expect(found(source)).toEqual(expected);
  });

  it.each([
    ['a non-null Boolean', 'fun run(force: Boolean): Boolean = force\n'],
    ['an override parameter', 'class A : B {\n    override fun run(force: Boolean?) {}\n}\n'],
    ['an override property', 'class A : B {\n    override val seen: Boolean? = null\n}\n'],
    ['a local variable', 'fun run() {\n    val found: Boolean? = lookup()\n    use(found)\n}\n'],
    ['a type argument', 'fun run(flags: List<Boolean?>) {}\n'],
    ['a function type', 'fun run(check: (Boolean?) -> Unit) {}\n'],
    ['another nullable type', 'fun run(name: String?, count: Int?) {}\n'],
    ['a name that ends in Boolean', 'fun run(force: MyBoolean?) {}\n'],
  ])('passes %s', (_name, source) => {
    expect(found(source)).toEqual([]);
  });
});
