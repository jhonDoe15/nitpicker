import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import { readMutatingMethodFindings as read } from './mutating-methods.mts';

const projectWith = useTempProjects('nitpicker-jvm-mutation-');

function scan(file: string, text: string, kotlin: boolean) {
  return read(projectWith({ [file]: text }), { projects: [PROJECT], kotlin });
}

function java(body: string, packageName = 'shop.domain') {
  return scan(
    'src/main/java/shop/domain/Prices.java',
    `package ${packageName};\nclass Prices {\n${body}\n}\n`,
    false,
  );
}

function kotlin(body: string, packageName = 'shop.domain') {
  return scan(
    'src/main/kotlin/shop/domain/Prices.kt',
    `package ${packageName}\nclass Prices {\n${body}\n}\n`,
    true,
  );
}

const lines = (findings: ReturnType<typeof java>) => findings.map(({ location }) => location.line);

describe('MutatingMethodInDomain in Java', () => {
  it('reports collection mutators and date setters on a parameter', () => {
    const findings = java(`  void a(List<String> items, Map<String, Integer> index, Date at) {
    items.add("x");
    index.put("a", 1);
    items.sort(null);
    at.setTime(0L);
    items.get(0);
  }`);
    expect(lines(findings)).toEqual([4, 5, 6, 7]);
    expect(findings[0]?.message).toBe(
      'Domain code does not change a value it was given, and `items.add(...)` changes the `List` parameter `items`; leave it as it is and build a new one instead: `List.copyOf(x)`, `Stream.toList()` or a new `ArrayList<>(x)` filled before it is returned. A collection created and filled in the same function is allowed. If this is intended, add {"rule":"pmd/MutatingMethodInDomain","paths":["src/main/java/shop/domain/Prices.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    [
      'a local collection built and filled in the same method',
      `  List<String> a(List<String> items) {
    List<String> out = new ArrayList<>();
    out.add("x");
    out.addAll(items);
    out.sort(null);
    return out;
  }`,
    ],
    [
      'a parameter replaced by a copy before the change',
      `  List<String> a(List<String> items) {
    items = new ArrayList<>(items);
    items.add("x");
    return items;
  }`,
    ],
    [
      'read-only calls, other receivers and other types',
      `  void a(List<String> items, StringBuilder text, Order order) {
    items.contains("x");
    items.stream().toList();
    text.append("x");
    order.items.add("x");
    order.add("x");
  }`,
    ],
  ])('allows %s', (_name, body) => {
    expect(lines(java(body))).toEqual([]);
  });

  it('reads domain packages only and skips adapter packages', () => {
    const body = '  void a(List<String> items) {\n    items.add("x");\n  }';
    expect(lines(java(body, 'shop.orders'))).toEqual([]);
    expect(lines(java(body, 'shop.domain.adapter'))).toEqual([]);
    expect(lines(java(body, 'shop.orders.domain.model'))).toEqual([4]);
  });
});

describe('MutatingMethodInDomain in Kotlin', () => {
  it('reports MutableList mutators and names the Kotlin building forms', () => {
    const findings = kotlin(`  fun a(items: MutableList<String>, index: MutableMap<String, Int>) {
    items.add("x")
    index.put("a", 1)
    items?.sortBy { it }
    items.size
  }`);
    expect(lines(findings)).toEqual([4, 5, 6]);
    expect(findings[1]?.message).toBe(
      'Domain code does not change a value it was given, and `index.put(...)` changes the `MutableMap` parameter `index`; leave it as it is and build a new one instead: `buildMap { putAll(x); ... }`, `x + (key to value)` or `x.toMutableMap()` filled before it is returned. A collection created and filled in the same function is allowed. If this is intended, add {"rule":"pmd/MutatingMethodInDomain","paths":["src/main/kotlin/shop/domain/Prices.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('allows buildList, a local mutable list and read-only collections', () => {
    expect(
      lines(
        kotlin(`  fun a(items: List<String>): List<String> {
    val out = mutableListOf<String>()
    out.add("x")
    out.addAll(items)
    return buildList {
      addAll(items)
      add("y")
    }
  }
  fun b(items: List<String>) = items.sorted()`),
      ),
    ).toEqual([]);
  });
});
