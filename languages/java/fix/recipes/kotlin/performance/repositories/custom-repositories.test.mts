import { describe, expect, it } from 'vitest';
import type { FixRecipe } from '../../../../../../../core/fix/typed/fix-types.mts';
import { applyRecipe } from '../../test-support/apply-recipe.mts';
import { kotlinProject } from '../../test-support/kotlin-project.mts';
import { entityExistsRecipe } from './existence/entity-exists.mts';
import { saveInLoopRecipe } from './loops/save-in-loop.mts';

const HEAD = 'class Orders(private val orderRepository: OrderRepository) {\n';
const SAVES = `${HEAD}    fun run(items: List<Order>) {\n        for (item in items) orderRepository.save(item)\n    }\n}\n`;
const SAVED = `${HEAD}    fun run(items: List<Order>) {\n        orderRepository.saveAll(items)\n    }\n}\n`;
const FINDS = `${HEAD}    fun has(id: Long): Boolean {\n        return orderRepository.findById(id).isPresent\n    }\n}\n`;
const EXISTS = `${HEAD}    fun has(id: Long): Boolean {\n        return orderRepository.existsById(id)\n    }\n}\n`;
const RECIPES: readonly (readonly [string, FixRecipe, string, string])[] = [
  ['save-in-loop', saveInLoopRecipe, SAVES, SAVED],
  ['entity-exists', entityExistsRecipe, FINDS, EXISTS],
];
const PATH = 'src/main/kotlin/demo/OrderRepository.kt';

function fixedIn(declaration: string, recipe: FixRecipe, text: string): string {
  const project = kotlinProject({ [PATH]: declaration });
  try {
    return applyRecipe(recipe, text, undefined, project.root);
  } finally {
    project.remove();
  }
}

describe.each(RECIPES)(
  '%s and the repository type of the project',
  (_name, recipe, before, after) => {
    it.each([
      ['a hand-written class', 'class OrderRepository(private val jdbc: JdbcTemplate) {\n}\n'],
      ['the marker interface', 'interface OrderRepository : Repository<Order, Long> {\n}\n'],
      [
        'a Java interface of its own',
        'public interface OrderRepository extends ReadOnlyRepository<Order, Long> {\n}\n',
      ],
    ])('keeps a call on %s', (_case, declaration) => {
      expect(fixedIn(declaration, recipe, before)).toBe(before);
    });

    it('keeps a call on a type the project does not declare', () => {
      expect(fixedIn('interface Other\n', recipe, before)).toBe(before);
      expect(applyRecipe(recipe, before)).toBe(before);
    });

    it.each([
      ['a Spring Data interface', 'interface OrderRepository : JpaRepository<Order, Long>\n'],
      [
        'a Java Spring Data interface',
        'public interface OrderRepository\n    extends CrudRepository<Order, Long>, OrderQueries {\n}\n',
      ],
      [
        'an interface over a base of the project',
        'interface OrderRepository : BaseRepository<Order>\ninterface BaseRepository<T> : JpaRepository<T, Long>\n',
      ],
    ])('rewrites a call on %s', (_case, declaration) => {
      expect(fixedIn(declaration, recipe, before)).toBe(after);
    });
  },
);
