import { afterEach, describe, expect, it } from 'vitest';
import { kotlinProject } from '../test-support/kotlin-project.mts';
import { repositoryTypes } from './repository-types.mts';

const cleanups: (() => void)[] = [];

function known(files: Readonly<Record<string, string>>): (type: string) => boolean {
  const { root, remove } = kotlinProject(files);
  cleanups.push(remove);
  return repositoryTypes(root).hasBatchCalls;
}

afterEach(() => {
  for (const remove of cleanups.splice(0)) {
    remove();
  }
});

describe('repositoryTypes', () => {
  it.each([
    ['a Kotlin interface', 'A.kt', 'interface OrderRepository : JpaRepository<Order, Long>\n'],
    [
      'a Kotlin interface with a body and annotations',
      'A.kt',
      '@Repository\ninterface OrderRepository : CrudRepository<Order, Long>, Extra {\n  fun a(): Int\n}\n',
    ],
    [
      'a declaration wrapped over lines',
      'A.kt',
      'interface OrderRepository :\n    PagingAndSortingRepository<Order, Long>,\n    ListCrudRepository<Order, Long>\n',
    ],
    [
      'a Java interface',
      'A.java',
      'public interface OrderRepository extends MongoRepository<Order, String> {}\n',
    ],
    [
      'a qualified base',
      'A.kt',
      'interface OrderRepository : org.springframework.data.jpa.repository.JpaRepository<Order, Map<String, Long>>\n',
    ],
  ])('accepts %s of a Spring Data base with the batch calls', (_case, name, text) => {
    expect(known({ [`src/${name}`]: text })('OrderRepository')).toBe(true);
  });

  it('follows a base interface the project declares', () => {
    const hasBatchCalls = known({
      'src/Base.kt': 'interface BaseRepository<T> : JpaRepository<T, Long>\n',
      'src/A.kt': 'interface OrderRepository : BaseRepository<Order>\n',
    });

    expect(hasBatchCalls('OrderRepository')).toBe(true);
  });

  it.each([
    ['extends the bare marker', 'interface OrderRepository : Repository<Order, Long>\n'],
    ['is a plain class', 'class OrderRepository(private val jdbc: JdbcTemplate)\n'],
    ['is reactive', 'interface OrderRepository : ReactiveCrudRepository<Order, Long>\n'],
    ['only pages', 'interface OrderRepository : PagingAndSortingRepository<Order, Long>\n'],
    ['is not declared in the project', 'interface OtherRepository : JpaRepository<A, Long>\n'],
    [
      'is declared twice, once without them',
      'interface OrderRepository : JpaRepository<A, Long>\ninterface OrderRepository : Repository<A, Long>\n',
    ],
    [
      'takes the batch calls from a base the project redeclares',
      'interface OrderRepository : CrudRepository<A, Long>\ninterface CrudRepository<T, I> : Repository<T, I>\n',
    ],
  ])('declines a type that %s', (_case, text) => {
    expect(known({ 'src/A.kt': text })('OrderRepository')).toBe(false);
  });

  it('declines everything without a project to search', () => {
    expect(repositoryTypes(undefined).hasBatchCalls('OrderRepository')).toBe(false);
  });
});
