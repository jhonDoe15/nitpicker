import { BEAN_RULES } from './rules/bean-rules.mjs';
import { DATA_CALL_RULES } from './rules/data/data-rules.mjs';
import { QUERY_RULES } from './rules/data/query-rules.mjs';
import { JPA_RULES } from './rules/jpa-rules.mjs';
import { PROXY_RULES } from './rules/proxy-rules.mjs';
import { WEB_RULES } from './rules/web-rules.mjs';

export const KOTLIN_SPRING_RULES = [
  ...BEAN_RULES,
  ...PROXY_RULES,
  ...WEB_RULES,
  ...JPA_RULES,
  ...QUERY_RULES,
  ...DATA_CALL_RULES,
];

export const KOTLIN_SPRING_RULE_IDS = KOTLIN_SPRING_RULES.map(({ name }) => `spring/${name}`);
