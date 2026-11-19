import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../../../test-support/apply-recipe.mts';
import { saveInLoopRecipe } from './save-in-loop.mts';

const HEAD = 'class Saver(private val orderRepository: OrderRepository, val ids: List<Long>) {\n';

function inFunction(body: string, parameters = 'items: List<Order>'): string {
  return `${HEAD}    fun run(${parameters}) {\n${body
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n')}\n    }\n}\n`;
}

const fix = (text: string): string => applyRecipe(saveInLoopRecipe, text);

describe('saveInLoopRecipe fixes', () => {
  it.each([
    ['for (item in items) orderRepository.save(item)', 'orderRepository.saveAll(items)'],
    ['for (item in items) { orderRepository.save(item) }', 'orderRepository.saveAll(items)'],
    ['for (item in items) {\n    orderRepository.save(item)\n}', 'orderRepository.saveAll(items)'],
    ['for (item in items)\n    orderRepository.save(item)', 'orderRepository.saveAll(items)'],
    ['for (item in items) {\n    orderRepository.save(item);\n}', 'orderRepository.saveAll(items)'],
    ['for (item in items) orderRepository.delete(item)', 'orderRepository.deleteAll(items)'],
    ['for (id in items) orderRepository.deleteById(id)', 'orderRepository.deleteAllById(items)'],
    ['items.forEach { orderRepository.save(it) }', 'orderRepository.saveAll(items)'],
    ['items.forEach { item -> orderRepository.save(item) }', 'orderRepository.saveAll(items)'],
    ['items.forEach {\n    orderRepository.save(it)\n}', 'orderRepository.saveAll(items)'],
    ['items.forEach(orderRepository::save)', 'orderRepository.saveAll(items)'],
    ['items.forEach(this.orderRepository::delete)', 'this.orderRepository.deleteAll(items)'],
    ['items.forEach { orderRepository.deleteById(it) }', 'orderRepository.deleteAllById(items)'],
    ['for (item in this.items) orderRepository.save(item)', 'orderRepository.saveAll(this.items)'],
    [
      'for (item in orderRepository.findAll()) orderRepository.save(item)',
      'orderRepository.saveAll(orderRepository.findAll())',
    ],
    [
      'orderRepository.findAll().forEach { orderRepository.delete(it) }',
      'orderRepository.deleteAll(orderRepository.findAll())',
    ],
  ])('rewrites %s', (body, after) => {
    expect(fix(inFunction(body))).toBe(inFunction(after));
  });

  it('keeps the code around the loop and reports the line of the save call', () => {
    const before = inFunction(
      'log.info("saving")\nfor (item in items) {\n    orderRepository.save(item)\n}\nlog.info("done")',
    );
    expect(fix(before)).toBe(
      inFunction('log.info("saving")\norderRepository.saveAll(items)\nlog.info("done")'),
    );
    expect(plannedLines(saveInLoopRecipe, before)).toEqual([5]);
  });

  it('rewrites a loop in a property, a field and a parameter repository', () => {
    const text = (call: string): string =>
      `class A {\n    @Autowired\n    lateinit var repo: Orders.OrderRepository\n    fun f(items: Set<Order>) {\n        ${call}\n    }\n}\n`;
    expect(fix(text('for (o in items) repo.save(o)'))).toBe(text('repo.saveAll(items)'));
    const param =
      'fun f(items: MutableList<Order>, repo: JpaRepository<Order, Long>) {\n    items.forEach { repo.save(it) }\n}\n';
    expect(fix(param)).toBe(
      'fun f(items: MutableList<Order>, repo: JpaRepository<Order, Long>) {\n    repo.saveAll(items)\n}\n',
    );
  });

  it('rewrites a local list built in place', () => {
    const body = 'val batch = listOf(a, b)\nfor (item in batch) orderRepository.save(item)';
    expect(fix(inFunction(body))).toBe(
      inFunction('val batch = listOf(a, b)\norderRepository.saveAll(batch)'),
    );
  });

  it('is a review fix', () => {
    expect(saveInLoopRecipe.safety).toBe('review');
  });
});

describe('saveInLoopRecipe declines', () => {
  it.each([
    'for (item in items) { orderRepository.save(item); count++ }',
    'for (item in items) {\n    audit(item)\n    orderRepository.save(item)\n}',
    'for (item in items) { if (item.ok) orderRepository.save(item) }',
    'for (item in items) { val saved = orderRepository.save(item) }',
    'for (item in items) orderRepository.save(item.copy())',
    'for (item in items) orderRepository.save(other)',
    'for (item in items) orderRepository.saveAndFlush(item)',
    'for (item in items) orderRepository.deleteById(item.id)',
    'for (item in items) orderRepository.save(item, flag)',
    'for ((index, item) in items.withIndex()) orderRepository.save(item)',
    'for (item in items.withIndex()) orderRepository.save(item)',
    'for (item in items.asSequence()) orderRepository.save(item)',
    'for (item in items.filter { it.ok }) orderRepository.save(item)',
    'for (item in 1..3) orderRepository.save(item)',
    'for (item in order.items) orderRepository.save(item)',
    'for (item in items) otherRepository.save(item)',
    'for (item in items) store.save(item)',
    'for (item in items) orderRepository?.save(item)',
    'for (item in items) orderRepository.save(item).also { log(it) }',
    'val x = items.forEach { orderRepository.save(it) }',
    'items.forEach { orderRepository.save(it) }.also { log(it) }',
    'items?.forEach { orderRepository.save(it) }',
    'order.items.forEach { orderRepository.save(it) }',
    'items.asSequence().forEach { orderRepository.save(it) }',
    'items.forEach { orderRepository.save(it.copy()) }',
    'items.forEach { orderRepository.save(it); n++ }',
    'items.forEach { item -> orderRepository.save(it) }',
    'items.forEach { (a, b) -> orderRepository.save(a) }',
    'items.forEach { _ -> orderRepository.save(it) }',
    'items.forEach { orderRepository.save(it) }\n.also { }',
    'items.forEach(orderRepository::saveAndFlush)',
    'items.forEach(orderRepository::save, extra)',
    'items.forEachIndexed { i, item -> orderRepository.save(item) }',
    'items.onEach { orderRepository.save(it) }',
    'items.map { orderRepository.save(it) }',
    'items.forEach(Consumer { orderRepository.save(it) })',
    'if (flag) items.forEach { orderRepository.save(it) }',
    'if (flag)\n    items.forEach { orderRepository.save(it) }',
    'val a =\n    items.forEach { orderRepository.save(it) }',
    'return items.forEach { orderRepository.save(it) }',
    'items.also { it.forEach { orderRepository.save(it) } }',
    'run { items.forEach { orderRepository.save(it) } }',
    'items.let { for (x in it) orderRepository.save(x) }',
    'val f = { for (x in items) orderRepository.save(x) }',
    'for (item in items) orderRepository.save(item) else other()',
    'loop@ for (item in items) orderRepository.save(item)',
  ])('%s', (body) => {
    const text = inFunction(body);
    expect(fix(text)).toBe(text);
  });

  it('keeps a trailing line comment after the rewritten loop', () => {
    expect(fix(inFunction('for (item in items) orderRepository.save(item) // keep'))).toBe(
      inFunction('orderRepository.saveAll(items) // keep'),
    );
  });

  it.each([
    [
      'a Sequence parameter',
      'items: Sequence<Order>',
      'for (item in items) orderRepository.save(item)',
    ],
    ['an Array parameter', 'items: Array<Order>', 'for (item in items) orderRepository.save(item)'],
    ['a Map parameter', 'items: Map<Long, Order>', 'items.forEach { orderRepository.save(it) }'],
    ['a nullable list', 'items: List<Order>?', 'for (item in items) orderRepository.save(item)'],
    ['an unknown type', 'items: Orders', 'for (item in items) orderRepository.save(item)'],
    ['an undeclared name', 'other: List<Order>', 'for (item in items) orderRepository.save(item)'],
    ['a Range', 'items: IntRange', 'for (item in items) orderRepository.save(item)'],
  ])('a loop over %s', (_, parameters, body) => {
    const text = inFunction(body, parameters);
    expect(fix(text)).toBe(text);
  });

  it('a name that is a different type in another scope', () => {
    const text = `${HEAD}    fun a(items: List<Order>) { for (i in items) orderRepository.save(i) }\n    fun b(items: Sequence<Order>) { }\n}\n`;
    expect(fix(text)).toBe(text);
  });

  it('a local variable that shadows the repository name', () => {
    const shadowed = [
      'val orderRepository = other()',
      'val orderRepository: Store = other()',
      'val (orderRepository, b) = pair',
    ].map((shadow) => inFunction(`${shadow}\nfor (item in items) orderRepository.save(item)`));
    expect(shadowed.map(fix)).toEqual(shadowed);
    const lambda = inFunction(
      'stores.forEach { orderRepository -> items.forEach { orderRepository.save(it) } }',
    );
    expect(fix(lambda)).toBe(lambda);
    const loop = inFunction(
      'for (orderRepository in stores) {\n    items.forEach { orderRepository.save(it) }\n}',
    );
    expect(fix(loop)).toBe(loop);
  });

  it('a receiver that is not declared in the file or is not a repository type', () => {
    const none = 'fun f(items: List<Order>) { for (i in items) repo.save(i) }\n';
    expect(fix(none)).toBe(none);
    const store =
      'class A(val repo: OrderStore) { fun f(items: List<Order>) { for (i in items) repo.save(i) } }\n';
    expect(fix(store)).toBe(store);
    const nullable =
      'class A(val repo: OrderRepository?) { fun f(items: List<Order>) { for (i in items) repo!!.save(i) } }\n';
    expect(fix(nullable)).toBe(nullable);
  });

  it('files that use reactive or coroutine repositories', () => {
    const texts = [
      'suspend fun g() {}',
      'fun g(): Mono<Order> = TODO()',
      'fun g(): Flux<Order> = TODO()',
    ].map((marker) => `${inFunction('for (item in items) orderRepository.save(item)')}${marker}\n`);
    expect(texts.map(fix)).toEqual(texts);
  });

  it('a comment inside the loop or the call', () => {
    const texts = [
      'for (item in items) { // one by one\n    orderRepository.save(item)\n}',
      'for (item in items) {\n    orderRepository.save(item) // save\n}',
      'for (item in items) /* each */ orderRepository.save(item)',
      'items.forEach { /* each */ orderRepository.save(it) }',
      'items.forEach { orderRepository.save(it) /* each */ }',
      'items.forEach(orderRepository::save /* each */)',
    ].map((body) => inFunction(body));
    expect(texts.map(fix)).toEqual(texts);
  });

  it('calls in comments and strings', () => {
    const text = inFunction(
      '// for (item in items) orderRepository.save(item)\nval s = "items.forEach { orderRepository.save(it) }"',
    );
    expect(fix(text)).toBe(text);
  });
});
