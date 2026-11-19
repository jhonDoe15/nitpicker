import { QUERY_ARRAY_MESSAGES, unboundedQueryArrays } from './unbounded-arrays.mts';
import { QUERY_ORDER_MESSAGES, unorderedQueries } from './unordered-queries.mts';

export const kotlinSourceRules = {
  messages: { ...QUERY_ORDER_MESSAGES, ...QUERY_ARRAY_MESSAGES },
  main: [unorderedQueries, unboundedQueryArrays],
};
