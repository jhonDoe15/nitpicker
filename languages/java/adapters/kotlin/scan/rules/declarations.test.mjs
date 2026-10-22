import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { genericNames, mutableModuleState } from './declarations.mjs';

function found(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [
    reported.rule,
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

describe('mutableModuleState', () => {
  it.each([
    ['a top-level var', 'var counter = 0\n', 'counter'],
    ['a private top-level var', 'private var counter = 0\n', 'counter'],
    ['a lateinit top-level var', 'lateinit var name: String\n', 'name'],
    ['a top-level mutable collection', 'val cache = mutableMapOf<String, Int>()\n', 'cache'],
    ['a top-level mutable type', 'val names: MutableList<String> = ArrayList()\n', 'names'],
    ['a top-level atomic', 'val hits = java.util.concurrent.atomic.AtomicInteger(0)\n', 'hits'],
    [
      'a mutable collection in an object',
      'object Registry {\n    val items = mutableListOf<String>()\n}\n',
      'items',
    ],
    ['a var in a data object', 'data object Settings {\n    var debug = false\n}\n', 'debug'],
    [
      'a var in a companion object',
      'class Shop {\n    companion object {\n        var instances = 0\n    }\n}\n',
      'instances',
    ],
    [
      'a state flow in a named companion',
      'class Shop {\n    companion object Store : Base() {\n        val state = MutableStateFlow(0)\n    }\n}\n',
      'state',
    ],
  ])('flags %s', (_name, source, subject) => {
    const [finding] = found(mutableModuleState, source);

    expect(finding?.[0]).toBe('MutableModuleState');
    expect(finding?.[2]).toBe(subject);
  });

  it.each([
    ['a top-level val of an immutable list', 'val names = listOf("a")\n'],
    ['a constant', 'const val NAME = "n"\n'],
    ['a delegated property', 'val config by lazy { mutableMapOf<String, String>() }\n'],
    [
      'instance state in a class',
      'class Cart {\n    var total = 0\n    val items = mutableListOf<String>()\n}\n',
    ],
    ['a constructor property on its own line', 'class Cart(\n    var total: Int,\n)\n'],
    [
      'a local var in a function',
      'fun count(): Int {\n    var total = 0\n    total += 1\n    return total\n}\n',
    ],
    [
      'a local var in an object function',
      'object Counter {\n    fun count(): Int {\n        var total = 0\n        return total\n    }\n}\n',
    ],
    ['an anonymous object', 'val listener = object : Listener {\n    var calls = 0\n}\n'],
    ['a var in a comment or string', '// var counter = 0\nval text = """\nvar counter = 0\n"""\n'],
  ])('passes %s', (_name, source) => {
    expect(found(mutableModuleState, source)).toEqual([]);
  });
});

describe('genericNames', () => {
  it.each([
    ['a Utils object', 'package demo.orders\n\nobject StringUtils\n', 'StringUtils'],
    ['a Helper class', 'package demo.orders\n\nclass OrderHelper(val x: Int)\n', 'OrderHelper'],
    ['a Manager after an acronym', 'package demo.orders\n\nclass IOManager\n', 'IOManager'],
    ['a Misc interface', 'package demo.orders\n\ninterface Misc\n', 'Misc'],
  ])('flags %s', (_name, source, subject) => {
    expect(found(genericNames, source)).toEqual([['GenericTypeName', 3, subject]]);
  });

  it.each([
    ['a name for the job', 'package demo.orders\n\nclass PriceRounder\n'],
    ['a framework role', 'package demo.orders\n\nclass JpaTransactionManager\n'],
    [
      'a type that implements one with the same ending',
      'package demo.orders\n\nclass OrderCacheHelper : CacheHelper\n',
    ],
    ['a word that only ends in the letters', 'package demo.orders\n\nclass Fulfillment\n'],
  ])('passes %s', (_name, source) => {
    expect(found(genericNames, source)).toEqual([]);
  });

  it('flags a generic package segment and passes a package named for what it holds', () => {
    expect(found(genericNames, 'package demo.common.text\n')).toEqual([
      ['GenericPackageName', 1, 'demo.common.text'],
    ]);
    expect(found(genericNames, 'package demo.shared.text\n')).toEqual([]);
    expect(found(genericNames, 'package demo.utilization\n')).toEqual([]);
  });
});
