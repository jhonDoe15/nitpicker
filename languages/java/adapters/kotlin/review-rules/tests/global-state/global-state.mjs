import { chainName, classesOf } from '../discovery/declarations.mjs';
import { familyOf, stateChanges } from './state-changes.mjs';
import { functionAround, isRestored } from './state-restores.mjs';

export const GLOBAL_STATE_RULE = 'GlobalStateLeakInTest';
const GLOBAL_STATE_MESSAGE =
  'This test changes process-wide state and nothing in the class puts it back, so the tests after it pass or fail depending on the order they run in. Save the old value and restore it in finally or in an @AfterEach or @AfterAll function (Kotest afterTest or afterSpec), or let an extension set and restore it: junit-pioneer @SetSystemProperty, @RestoreSystemProperties, @DefaultLocale or @DefaultTimeZone, a system-stubs @SystemStub field, Kotest withSystemProperty { }, or Dispatchers.resetMain() after Dispatchers.setMain.';

function symbolAt(scanned, offset) {
  const fn = functionAround(scanned, offset);
  return chainName(classesOf(scanned), offset, fn?.name);
}

export function globalStateReports(scanned, suites) {
  return stateChanges(scanned)
    .filter((change) => !isRestored(scanned, change, suites))
    .map((change) => {
      const symbol = symbolAt(scanned, change.offset);
      return {
        rule: GLOBAL_STATE_RULE,
        offset: change.offset,
        symbol,
        key: `${symbol}:${familyOf(change)}`,
        message: GLOBAL_STATE_MESSAGE,
      };
    });
}
