import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { unboundedQueryArrays } from './unbounded-arrays.mjs';
import { unorderedQueries } from './unordered-queries.mjs';

function lines(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const REPOSITORY = `class Reads(private val em: EntityManager, private val accounts: AccountRepository) {\n`;
const ACTIVE = 'private const val ACTIVE = "select a from Account a where a.active = true"\n';
const NEWEST =
  'private const val NEWEST = "select a from Account a order by a.createdAt desc, a.id"\n';

describe('unorderedQueries', () => {
  it.each([
    [
      'a LIMIT with no ORDER BY',
      'const val RECENT = "select id from account where active limit 20"\n',
      [1],
    ],
    [
      'an OFFSET in a raw string',
      'const val PAGE = """\n    select id from account\n    offset 40\n"""\n',
      [1],
    ],
    [
      'an array_agg list',
      'const val TAGS = "select a.id, array_agg(t.name) from a join t on t.a = a.id"\n',
      [1],
    ],
    [
      'setMaxResults on a query whose text has no ORDER BY',
      `${ACTIVE}${REPOSITORY}    fun page() = em.createQuery(ACTIVE, Account::class.java).setMaxResults(20).resultList\n}\n`,
      [3],
    ],
    [
      'setFirstResult on a held query',
      `${ACTIVE}${REPOSITORY}    fun page(n: Int): List<Account> {\n        val query = em.createQuery(ACTIVE, Account::class.java)\n        query.setFirstResult(n * 20)\n        return query.resultList\n    }\n}\n`,
      [5],
    ],
    [
      'a criteria query with no orderBy',
      `${REPOSITORY}    fun page(): List<Account> {\n        val criteria = em.criteriaBuilder.createQuery(Account::class.java)\n        criteria.from(Account::class.java)\n        return em.createQuery(criteria).setMaxResults(20).resultList\n    }\n}\n`,
      [5],
    ],
    [
      'an unsorted PageRequest passed to findAll',
      `${REPOSITORY}    fun page(n: Int) = accounts.findAll(PageRequest.of(n, 20))\n    fun sized() = accounts.findAll(Pageable.ofSize(50))\n}\n`,
      [2, 3],
    ],
    [
      'a held unsorted PageRequest',
      `${REPOSITORY}    fun page(n: Int): Page<Account> {\n        val pageable = PageRequest.of(n, 20)\n        return accounts.findAll(pageable)\n    }\n}\n`,
      [3],
    ],
  ])('reports %s', (_, source, expected) => {
    expect(lines(unorderedQueries, source)).toEqual(expected);
  });

  it.each([
    ['an ordered LIMIT', 'const val RECENT = "select id from account order by id limit 20"\n'],
    [
      'a constant existence check',
      'const val TAKEN = "select 1 from account where name = ? limit 1"\n',
    ],
    ['an ordered aggregate', 'const val TAGS = "select json_agg(t.name order by t.name) from t"\n'],
    [
      'a sentence that names a limit',
      'const val NOTE = "Shows at most 20 rows; raise the limit in settings."\n',
    ],
    ['an interpolated clause', 'fun q(order: String) = "select id from account $order limit 20"\n'],
    [
      'an ordered JPQL page',
      `${NEWEST}${REPOSITORY}    fun page() = em.createQuery(NEWEST, Account::class.java).setMaxResults(20).resultList\n}\n`,
    ],
    [
      'a count with setMaxResults(1)',
      `${REPOSITORY}    fun taken() = em.createQuery("select count(a) from Account a").setMaxResults(1).singleResult\n}\n`,
    ],
    [
      'a query text the scan cannot see',
      `${REPOSITORY}    fun page(jpql: String) = em.createQuery(jpql).setMaxResults(20).resultList\n}\n`,
    ],
    [
      'a sorted criteria query',
      `${REPOSITORY}    fun page(): List<Account> {\n        val criteria = em.criteriaBuilder.createQuery(Account::class.java)\n        criteria.orderBy(em.criteriaBuilder.asc(criteria.from(Account::class.java).get<Long>("id")))\n        return em.createQuery(criteria).setMaxResults(20).resultList\n    }\n}\n`,
    ],
    [
      'a sorted PageRequest',
      `${REPOSITORY}    fun page(n: Int) = accounts.findAll(PageRequest.of(n, 20, Sort.by("id")))\n}\n`,
    ],
    [
      'a PageRequest that goes elsewhere',
      `${REPOSITORY}    fun page(n: Int): Pageable = PageRequest.of(n, 20)\n}\n`,
    ],
  ])('allows %s', (_, source) => {
    expect(lines(unorderedQueries, source)).toEqual([]);
  });
});

describe('unboundedQueryArrays', () => {
  it.each([
    [
      'a list parameter bound to an in list',
      `${REPOSITORY}    fun byIds(ids: List<Long>) = em.createQuery(BY_IDS).setParameter("ids", ids).resultList\n}\n`,
      [2],
    ],
    [
      'a mapped list passed to findAllById',
      `${REPOSITORY}    fun byOrders(orders: List<Order>): List<Account> {\n        val ids = orders.map { it.accountId }\n        return accounts.findAllById(ids)\n    }\n}\n`,
      [4],
    ],
    [
      'a set in a MapSqlParameterSource',
      'fun named(ids: Set<Long>) = MapSqlParameterSource("ids", ids)\n',
      [1],
    ],
    [
      'a collection added to a parameter source',
      'fun named(ids: Collection<Long>) = MapSqlParameterSource().addValue("ids", ids)\n',
      [1],
    ],
  ])('reports %s', (_, source, expected) => {
    expect(lines(unboundedQueryArrays, source)).toEqual(expected);
  });

  it.each([
    [
      'an empty check first',
      `${REPOSITORY}    fun byIds(ids: List<Long>): List<Account> {\n        if (ids.isEmpty()) return emptyList()\n        return em.createQuery(BY_IDS).setParameter("ids", ids).resultList\n    }\n}\n`,
    ],
    [
      'chunks',
      `${REPOSITORY}    fun byIds(ids: List<Long>) = ids.chunked(1000).flatMap { chunk -> em.createQuery(BY_IDS).setParameter("ids", chunk).resultList }\n}\n`,
    ],
    [
      'a fixed list',
      `${REPOSITORY}    fun two(a: Long, b: Long): List<Account> {\n        val ids = listOf(a, b)\n        return accounts.findAllById(ids)\n    }\n}\n`,
    ],
    [
      'a single value',
      `${REPOSITORY}    fun byId(id: Long) = em.createQuery(BY_ID).setParameter("id", id).singleResult\n}\n`,
    ],
    [
      'a size bound',
      `${REPOSITORY}    fun byIds(ids: List<Long>): List<Account> {\n        require(ids.size <= 1000)\n        return accounts.findAllById(ids)\n    }\n}\n`,
    ],
  ])('allows %s', (_, source) => {
    expect(lines(unboundedQueryArrays, source)).toEqual([]);
  });
});
