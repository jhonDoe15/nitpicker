import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../../../test-support/apply-recipe.mts';
import { entityExistsRecipe } from './entity-exists.mts';

const IMPORT = 'import org.springframework.data.repository.findByIdOrNull\n';
const BODY_INDENT = '        ';

function inClass(
  body: string,
  imports = '',
  parameter = 'orderRepository: OrderRepository',
): string {
  const lines = body
    .split('\n')
    .map((line) => `${BODY_INDENT}${line}`)
    .join('\n');
  return `package demo\n\n${imports}\nclass Checker(private val ${parameter}) {\n    fun check(id: Long): Boolean {\n${lines}\n    }\n}\n`;
}

const fix = (text: string): string => applyRecipe(entityExistsRecipe, text);

describe('entityExistsRecipe fixes', () => {
  it.each([
    ['return orderRepository.findById(id).isPresent', 'return orderRepository.existsById(id)'],
    ['return orderRepository.findById(id).isPresent()', 'return orderRepository.existsById(id)'],
    ['return orderRepository.findById(id).isEmpty', 'return !orderRepository.existsById(id)'],
    ['return orderRepository.findById(id).isEmpty()', 'return !orderRepository.existsById(id)'],
    ['return !orderRepository.findById(id).isPresent', 'return !orderRepository.existsById(id)'],
    [
      'return a && orderRepository.findById(id).isEmpty',
      'return a && !orderRepository.existsById(id)',
    ],
    [
      'return a || orderRepository.findById(id).isEmpty',
      'return a || !orderRepository.existsById(id)',
    ],
    [
      'return orderRepository.findById(id).isPresent && a',
      'return orderRepository.existsById(id) && a',
    ],
    [
      'if (orderRepository.findById(id).isEmpty) {\n    return false\n}\nreturn true',
      'if (!orderRepository.existsById(id)) {\n    return false\n}\nreturn true',
    ],
    [
      'return this.orderRepository.findById(id).isPresent',
      'return this.orderRepository.existsById(id)',
    ],
    [
      'return orderRepository.findById(order.id!!).isPresent',
      'return orderRepository.existsById(order.id!!)',
    ],
    [
      'return orderRepository.findById(ids[0]).isPresent',
      'return orderRepository.existsById(ids[0])',
    ],
    [
      'return orderRepository\n    .findById(id)\n    .isPresent',
      'return orderRepository.existsById(id)',
    ],
    [
      'val found = orderRepository.findById(id).isPresent\nreturn found',
      'val found = orderRepository.existsById(id)\nreturn found',
    ],
    ['return orderRepository.findByIdOrNull(id) != null', 'return orderRepository.existsById(id)'],
    ['return orderRepository.findByIdOrNull(id) == null', 'return !orderRepository.existsById(id)'],
    [
      'return orderRepository.findByIdOrNull(id) != null && a',
      'return orderRepository.existsById(id) && a',
    ],
  ])('rewrites %s', (before, after) => {
    expect(fix(inClass(before))).toBe(inClass(after));
  });

  it('reports the line of the finder call', () => {
    const before = inClass('val a = 1\nreturn orderRepository\n    .findById(id)\n    .isPresent');
    expect(plannedLines(entityExistsRecipe, before)).toEqual([8]);
  });

  it('rewrites a field, a lateinit property and a parameter repository', () => {
    const field =
      'class A {\n    @Autowired\n    lateinit var repo: JpaRepository<Order, Long>\n    fun f(id: Long) = repo.findById(id).isPresent\n}\n';
    expect(fix(field)).toBe(field.replace('repo.findById(id).isPresent', 'repo.existsById(id)'));
    const param = 'fun f(repo: Orders.OrderRepository, id: Long) = repo.findById(id).isEmpty\n';
    expect(fix(param)).toBe(
      'fun f(repo: Orders.OrderRepository, id: Long) = !repo.existsById(id)\n',
    );
  });

  it('drops the findByIdOrNull import when every use is rewritten, in one fix', () => {
    const before = inClass(
      'val a = orderRepository.findByIdOrNull(id) != null\nreturn orderRepository.findByIdOrNull(2L) == null',
      `${IMPORT}import java.util.UUID\n`,
    );
    expect(fix(before)).toBe(
      inClass(
        'val a = orderRepository.existsById(id)\nreturn !orderRepository.existsById(2L)',
        'import java.util.UUID\n',
      ),
    );
    const fixes = entityExistsRecipe.plan({
      files: [{ path: 'src/main/kotlin/demo/A.kt', text: before }],
    }).fixes;
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.alsoFixes).toHaveLength(1);
  });

  it('drops the blank line that set off the only import', () => {
    const before = inClass('return orderRepository.findByIdOrNull(id) != null', IMPORT);
    expect(fix(before)).toBe(
      inClass('return orderRepository.existsById(id)').replace(
        'package demo\n\n\n',
        'package demo\n\n',
      ),
    );
  });

  it('keeps the import while another use of findByIdOrNull remains', () => {
    const before = inClass(
      'val a = orderRepository.findByIdOrNull(id) != null\nreturn orderRepository.findByIdOrNull(id)?.paid == true',
      IMPORT,
    );
    expect(fix(before)).toBe(
      inClass(
        'val a = orderRepository.existsById(id)\nreturn orderRepository.findByIdOrNull(id)?.paid == true',
        IMPORT,
      ),
    );
  });

  it('is a review fix', () => {
    expect(entityExistsRecipe.safety).toBe('review');
  });
});

describe('entityExistsRecipe declines', () => {
  it.each([
    'return orderRepository.findById(id).isPresent.not()',
    'return orderRepository.findById(id).get().paid',
    'return orderRepository.findById(id).orElse(null) != null',
    'return orderRepository.findById(id).map { it.paid }.isPresent',
    'return orderRepository.findById(id).isPresent == true',
    'return !orderRepository.findById(id).isEmpty',
    'return orderRepository.findById(id).isPresent.and(a)',
    'return orderRepository.findById(id).isPresentOrSo',
    'return orderRepository.findById(id)',
    'return orderRepository.findById(id) != null',
    'return orderRepository.findByIdOrNull(id)?.paid == true',
    'return orderRepository.findByIdOrNull(id) != null.not()',
    'return orderRepository.findByIdOrNull(id) === null',
    'return orderRepository.findByIdOrNull(id) == other',
    'return orderRepository.findByIdOrNull(id).also { } != null',
    'return a == orderRepository.findById(id).isPresent',
    'return a ?: orderRepository.findById(id).isPresent',
    'return a.orderRepository.findById(id).isPresent',
    'return orderRepository?.findById(id)?.isPresent == true',
    'return orderRepository!!.findById(id).isPresent',
    'return orderRepository.findById(id = id).isPresent',
    'return orderRepository.findById(id, extra).isPresent',
    'return orderRepository.findAllById(ids).isEmpty()',
    'return orderRepository.existsById(id)',
    'return orderRepository.findByName(name).isPresent',
    'return orderRepository.findByIdOrNull(id) != null.also { }',
    'val x = if (a) orderRepository.findById(id).isPresent else false\nreturn x',
  ])('%s', (body) => {
    const text = inClass(body);
    expect(fix(text)).toBe(text);
  });

  it('a local variable or parameter that shadows the repository name', () => {
    const shadowed = [
      'val orderRepository = other()',
      'val orderRepository: Store = other()',
      'val (orderRepository, b) = pair',
    ].map((shadow) => inClass(`${shadow}\nreturn orderRepository.findById(id).isPresent`));
    expect(shadowed.map(fix)).toEqual(shadowed);
    const lambda = inClass(
      'return stores.any { orderRepository -> orderRepository.findById(id).isPresent }',
    );
    expect(fix(lambda)).toBe(lambda);
    const parameter = inClass('return orderRepository.findById(id).isPresent').replace(
      '(id: Long)',
      '(id: Long, orderRepository: Store)',
    );
    expect(fix(parameter)).toBe(parameter);
  });

  it('a receiver that is not declared with a repository type', () => {
    const none = 'fun f(id: Long) = repo.findById(id).isPresent\n';
    expect(fix(none)).toBe(none);
    const store = inClass('return repo.findById(id).isPresent', '', 'repo: OrderStore');
    expect(fix(store)).toBe(store);
    const nullable = inClass('return repo.findById(id).isPresent', '', 'repo: OrderRepository?');
    expect(fix(nullable)).toBe(nullable);
    const imported = inClass(
      'return orderStore.findById(id).isPresent',
      '',
      'orderStore: OrderRepositoryAdapter',
    );
    expect(fix(imported)).toBe(imported);
  });

  it('files that use reactive or coroutine repositories', () => {
    const texts = ['suspend fun g() {}', 'fun g(): Mono<Order> = TODO()'].map(
      (marker) => `${inClass('return orderRepository.findById(id).isPresent')}${marker}\n`,
    );
    expect(texts.map(fix)).toEqual(texts);
  });

  it('a comment inside the expression', () => {
    const texts = [
      'return orderRepository.findById(id) /* any */.isPresent',
      'return orderRepository.findById(/* key */ id).isPresent',
      'return orderRepository.findById(id) // exists?\n    .isPresent',
    ].map((body) => inClass(body));
    expect(texts.map(fix)).toEqual(texts);
  });

  it('calls in comments and strings', () => {
    const text = inClass(
      '// orderRepository.findById(id).isPresent\nreturn "orderRepository.findById(id).isPresent".isEmpty()',
    );
    expect(fix(text)).toBe(text);
  });
});
