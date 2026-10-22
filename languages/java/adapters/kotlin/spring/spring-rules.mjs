import { BEAN_RULES } from './rules/bean-rules.mjs';
import { CLIENT_RULES } from './rules/client/http-client-rules.mjs';
import { DATA_CALL_RULES } from './rules/data/data-rules.mjs';
import { QUERY_RULES } from './rules/data/query-rules.mjs';
import { FILTER_IN_QUERY_RULES } from './rules/data/filter-in-query-rule.mjs';
import { LOOP_WRITE_RULES } from './rules/data/loop-write-rules.mjs';
import { QUERY_CONCATENATION_RULES } from './rules/data/query-concatenation-rule.mjs';
import { JPA_RULES } from './rules/jpa-rules.mjs';
import { ENUM_STRING_RULES } from './rules/mapping/enum-string-rule.mjs';
import { HASH_CODE_RULES } from './rules/mapping/hash-code-rule.mjs';
import { PROXY_RULES } from './rules/proxy-rules.mjs';
import { SECURITY_RULES } from './rules/security/security-rules.mjs';
import { COLLECTION_STATE_RULES } from './rules/startup/collection-state-rule.mjs';
import { POST_CONSTRUCT_RULES } from './rules/startup/post-construct-rule.mjs';
import { SECRET_DEFAULT_RULES } from './rules/startup/secret-default-rule.mjs';
import { TRANSACTION_RULES } from './rules/transactions/transaction-rules.mjs';
import { WEB_RULES } from './rules/web-rules.mjs';
import { ERROR_LEAK_RULES } from './rules/web/error-leak-rule.mjs';
import { TYPED_RULES } from './rules/web/typed-rules.mjs';

export const KOTLIN_SPRING_RULES = [
  ...BEAN_RULES,
  ...PROXY_RULES,
  ...WEB_RULES,
  ...JPA_RULES,
  ...QUERY_RULES,
  ...DATA_CALL_RULES,
  ...CLIENT_RULES,
  ...POST_CONSTRUCT_RULES,
  ...SECRET_DEFAULT_RULES,
  ...COLLECTION_STATE_RULES,
  ...TYPED_RULES,
  ...ERROR_LEAK_RULES,
  ...SECURITY_RULES,
  ...TRANSACTION_RULES,
  ...ENUM_STRING_RULES,
  ...HASH_CODE_RULES,
  ...QUERY_CONCATENATION_RULES,
  ...LOOP_WRITE_RULES,
  ...FILTER_IN_QUERY_RULES,
];

export const KOTLIN_SPRING_RULE_IDS = KOTLIN_SPRING_RULES.map(({ name }) => `pmd/${name}`);
