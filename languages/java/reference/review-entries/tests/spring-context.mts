import { ruleEntry } from '../../typed/entry-views.mts';
import type { RuleEntry } from '../../typed/entry-views.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from '../../catalog-rules.mts';
import {
  SPRING_CONTEXT_ALLOWED,
  SPRING_CONTEXT_EXCEPTION_RULE,
  SPRING_CONTEXT_RULE,
} from '../../../adapters/review-rules/spring-contexts/spring-contexts.mts';

export function springContextEntry(): RuleEntry {
  return ruleEntry({
    page: 'java-nitpicker',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    tool: 'pmd',
    rule: SPRING_CONTEXT_RULE,
    summary:
      'A `@SpringBootTest` class whose configuration equals that of other test classes of the module except for its set of `@MockBean`, `@MockitoBean`, `@SpyBean` and `@MockitoSpyBean` fields, when the classes with that configuration have three or more distinct sets. One class of every set but the largest is reported, as a descriptive finding that never fails the gate. Classes with `@DirtiesContext`, a nested configuration, `@DynamicPropertySource` or a superclass outside the module are left out.',
    why: 'Spring caches the application context by configuration, and the set of mock beans is part of the key, so each of these classes starts the whole application again. In a suite with many of them the context starts are most of the run time. Nitpicker reads the test sources of every module for it and prints it as a PMD rule.',
    allowed: SPRING_CONTEXT_ALLOWED,
    exception: { key: 'exceptions', rule: SPRING_CONTEXT_EXCEPTION_RULE },
    docs: [{ label: 'Java preset guide', path: 'docs/java-preset/spring-test-contexts.md' }],
  });
}
