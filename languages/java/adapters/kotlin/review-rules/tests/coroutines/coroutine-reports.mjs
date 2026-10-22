import { FIXED_SLEEP_RULE } from '../../../../../messages/wait-advice.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import {
  declaredScopes,
  ESCAPING_MESSAGE,
  ESCAPING_RULE,
  escapingLaunches,
  globalScopeAliases,
  teardownText,
} from './escaping-launches.mjs';
import { REAL_DELAY_MESSAGE, realDelays } from './real-delays.mjs';
import { contextDeclarations } from './scope-hosts.mjs';

function reportsOf(test, found, { rule, message, key }) {
  return found.map((entry) => ({
    rule,
    offset: entry.offset,
    symbol: test.symbol,
    key: key(test.symbol, entry),
    message,
  }));
}

export function coroutineReports(scanned, suites, project) {
  const { code, source } = scanned;
  const context = {
    code,
    project,
    declarations: contextDeclarations(code),
    scopes: declaredScopes(code),
    aliases: globalScopeAliases(code, source),
    teardown: teardownText(scanned),
  };
  return testBodies(scanned, suites).flatMap((test) => [
    ...reportsOf(test, escapingLaunches({ ...context, node: test }), {
      rule: ESCAPING_RULE,
      message: ESCAPING_MESSAGE,
      key: (symbol, entry) => `${symbol}:${entry.builder}`,
    }),
    ...reportsOf(test, realDelays({ ...context, node: test }), {
      rule: FIXED_SLEEP_RULE,
      message: REAL_DELAY_MESSAGE,
      key: (symbol) => `${symbol}:delay:real-dispatcher`,
    }),
  ]);
}
