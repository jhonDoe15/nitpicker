import { describe, expect, it } from 'vitest';
import { kindOfBody } from './body-kind.mts';
import { scanKotlinSource } from './kotlin-scan.mts';

function kindOfLastBody(text: string): string {
  const { code } = scanKotlinSource(text);
  return kindOfBody(code, code.lastIndexOf('{'));
}

describe('kindOfBody', () => {
  it.each([
    ['class A {', 'type'],
    ['class A(val x: Int = 0) : B() {', 'type'],
    ['data class A(\n    val x: Int,\n) {', 'type'],
    ['class A\n{', 'type'],
    ['class A\n    : B() {', 'type'],
    ['val r = foo(object : Runnable {', 'type'],
    ['companion object {', 'type'],
    ['interface I {', 'interface'],
    ['fun interface I {', 'interface'],
    ['fun f() {', 'other'],
    ['init {', 'other'],
    ['list.forEach {', 'other'],
  ])('classifies %s', (header, kind) => {
    expect(kindOfLastBody(`val first = 1\n${header}\n}`)).toBe(kind);
  });

  it('does not read earlier brace-less declarations as the header', () => {
    expect(kindOfLastBody('val log = Foo::class.java\nfun f() {\n}')).toBe('other');
    expect(kindOfLastBody('class Box(var n: Int = 0)\n\nfun f() {\n}')).toBe('other');
    expect(kindOfLastBody('interface Marker\n\nabstract class Shape {\n}')).toBe('type');
  });
});
