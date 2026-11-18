import type { CallView } from '../call-views.mts';

const DRIZZLE_OPERATORS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'and',
  'or',
  'not',
  'isNull',
  'isNotNull',
  'inArray',
  'notInArray',
  'like',
  'ilike',
  'notLike',
  'notIlike',
  'between',
  'notBetween',
  'exists',
  'notExists',
  'asc',
  'desc',
  'sql',
  'placeholder',
  'arrayContains',
  'arrayContained',
  'arrayOverlaps',
]);
const SQL_FRAGMENTS = new Set(['raw', 'join', 'identifier', 'placeholder', 'empty']);
const PRISMA_FRAGMENTS = new Set(['sql', 'raw', 'join', 'empty']);

function isDrizzlePackage(pkg: string): boolean {
  return pkg === 'drizzle-orm' || pkg.startsWith('drizzle-orm/');
}

function isPrismaPackage(pkg: string): boolean {
  return pkg === '@prisma/client' || pkg === '.prisma/client' || pkg.startsWith('@prisma/client/');
}

export function isExpressionHelper(pkg: string, view: CallView): boolean {
  const [first, second, ...rest] = view.names;
  if (first === undefined) {
    return false;
  }
  if (isDrizzlePackage(pkg)) {
    const isFragment = second !== undefined && first === 'sql' && SQL_FRAGMENTS.has(second);
    return rest.length === 0 && (second === undefined ? DRIZZLE_OPERATORS.has(first) : isFragment);
  }
  return (
    isPrismaPackage(pkg) &&
    first === 'Prisma' &&
    second !== undefined &&
    rest.length === 0 &&
    PRISMA_FRAGMENTS.has(second)
  );
}
