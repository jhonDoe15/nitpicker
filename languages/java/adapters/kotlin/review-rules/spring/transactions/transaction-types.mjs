import { group } from '../spring-types.mjs';

const SPRING = 'org.springframework';
const CAFFEINE = 'com.github.benmanes.caffeine.cache';
const GUAVA = 'com.google.common.cache';

export const TRANSACTION_TEMPLATES = group([
  `${SPRING}.transaction.support.TransactionTemplate`,
  `${SPRING}.transaction.support.TransactionOperations`,
  `${SPRING}.transaction.reactive.TransactionalOperator`,
]);
export const TRANSACTIONAL_OPERATOR = group([
  `${SPRING}.transaction.reactive.TransactionalOperator`,
]);
export const TEMPLATE_CALLS = group(['execute', 'executeWithoutResult', 'executeAndAwait']);
export const OPERATOR_CALLS = group(['transactional', 'execute', 'executeAndAwait']);
export const BEANS = group([
  `${SPRING}.stereotype.Component`,
  `${SPRING}.stereotype.Service`,
  `${SPRING}.stereotype.Repository`,
]);
export const JPA_REPOSITORY = group([`${SPRING}.data.jpa.repository.JpaRepository`]);
export const SPRING_CACHE = group([`${SPRING}.cache.Cache`]);
export const CACHE_MANAGER = group([`${SPRING}.cache.CacheManager`]);
export const CACHE_PUT = group([`${SPRING}.cache.annotation.CachePut`]);
export const CACHE_EVICT = group([`${SPRING}.cache.annotation.CacheEvict`]);
export const CACHING = group([`${SPRING}.cache.annotation.Caching`]);
export const LOCAL_CACHES = group([
  `${CAFFEINE}.Cache`,
  `${CAFFEINE}.LoadingCache`,
  `${GUAVA}.Cache`,
  `${GUAVA}.LoadingCache`,
]);
export const SPRING_CACHE_WRITES = group([
  'put',
  'putIfAbsent',
  'evict',
  'evictIfPresent',
  'clear',
  'invalidate',
]);
export const LOCAL_CACHE_WRITES = group(['put', 'putAll', 'invalidate', 'invalidateAll']);
export const VIEW_WRITES = group([
  'put',
  'putAll',
  'putIfAbsent',
  'remove',
  'replace',
  'compute',
  'computeIfAbsent',
  'computeIfPresent',
  'merge',
  'clear',
  'set',
  'getOrPut',
]);
export const MEMO_WRITES = group([
  'put',
  'putIfAbsent',
  'computeIfAbsent',
  'compute',
  'merge',
  'set',
  'getOrPut',
]);
export const MAP_TYPES = group([
  'Map',
  'MutableMap',
  'HashMap',
  'LinkedHashMap',
  'ConcurrentMap',
  'ConcurrentHashMap',
  'ConcurrentSkipListMap',
  'mutableMapOf',
  'hashMapOf',
  'linkedMapOf',
]);
