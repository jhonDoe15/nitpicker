import { kotlinSourceRules as rulesResourceLifetime } from '../../review-rules/coroutines/resource-lifetime.mts';
import { kotlinSourceRules as rulesSuspendCleanup } from '../../review-rules/coroutines/suspend-cleanup.mts';
import { kotlinSourceRules as rulesFanOut } from '../../review-rules/main/fan-out/fan-out.mts';
import { kotlinSourceRules as rulesUnsafeCasts } from '../casts/unsafe-casts.mts';
import { kotlinSourceRules as rulesCostlyCollections } from '../collections/costly-collections.mts';
import { kotlinSourceRules as rulesNullMapValues } from '../collectors/null-map-values.mts';
import { kotlinSourceRules as rulesConfigurationReads } from '../configuration/configuration-reads.mts';
import { kotlinSourceRules as rulesFutureCompletions } from '../futures/future-completions.mts';
import { kotlinSourceRules as rulesRootScopeLaunches } from '../futures/root-scope-launches.mts';
import { kotlinSourceRules as rulesUnboundedWaits } from '../futures/unbounded-waits.mts';
import { kotlinSourceRules as rulesHttpValues } from '../http/http-values.mts';
import { kotlinSourceRules as rulesCleanupOrder } from '../lifecycles/cleanup/cleanup-order.mts';
import { kotlinSourceRules as rulesAddOnlyProperties } from '../lifecycles/growth/add-only-properties.mts';
import { kotlinSourceRules as rulesCachedDeferred } from '../lifecycles/memo/cached-deferred.mts';
import { kotlinSourceRules as rulesPendingFutures } from '../lifecycles/pending/pending-futures.mts';
import { kotlinSourceRules as rulesTimerFields } from '../lifecycles/timers/timer-fields.mts';
import { kotlinSourceRules as rulesRepeatedStrings } from '../literals/repeated-strings.mts';
import { kotlinSourceRules as rulesLogFormatRules } from '../logging/log-format-rules.mts';
import { kotlinSourceRules as rulesSimplerLogic } from '../logic/simpler-logic.mts';
import { kotlinSourceRules as rulesOperandSlips } from '../operands/operand-slips.mts';
import { kotlinSourceRules as rulesProcessWaits } from '../processes/process-waits.mts';
import { kotlinSourceRules as rulesQueryRules } from '../queries/query-rules.mts';
import { kotlinSourceRules as rulesRegexDefects } from '../regexes/regex-defects.mts';
import { kotlinSourceRules as rulesRegexValues } from '../regexes/regex-values.mts';
import { kotlinSourceRules as rulesInlineCloseables } from '../resources/inline-closeables.mts';
import { kotlinSourceRules as rulesCalls } from './calls.mts';
import { kotlinSourceRules as rulesCatches } from './catches.mts';
import { kotlinSourceRules as rulesDeclarations } from './declarations.mts';
import { kotlinSourceRules as rulesMarkers } from './markers.mts';
import { kotlinSourceRules as rulesHardcodedSecrets } from './secrets/hardcoded-secrets.mts';
import { kotlinSourceRules as rulesSecretNames } from './secrets/secret-names.mts';
import { kotlinSourceRules as rulesSecretsInLogs } from './secrets/secrets-in-logs.mts';
import { kotlinSourceRules as rulesTests } from './tests.mts';
import { kotlinSourceRules as rulesClients } from '../security/clients.mts';
import { kotlinSourceRules as rulesCrypto } from '../security/crypto.mts';
import { kotlinSourceRules as rulesSql } from '../security/sql.mts';
import { kotlinSourceRules as rulesCompatibilityShims } from '../signatures/compatibility-shims.mts';
import { kotlinSourceRules as rulesParameterMutation } from '../signatures/parameter-mutation.mts';
import { kotlinSourceRules as rulesTriState } from '../signatures/tri-state.mts';
import { kotlinSourceRules as rulesDefaultTimeZone } from '../time/default-time-zone.mts';
import { kotlinSourceRules as rulesTimeUnits } from '../time/units/time-units.mts';
import { kotlinSourceRules as rulesUriParsing } from '../uris/uri-parsing.mts';

export const directoryRules = [
  rulesResourceLifetime,
  rulesSuspendCleanup,
  rulesFanOut,
  rulesUnsafeCasts,
  rulesCostlyCollections,
  rulesNullMapValues,
  rulesConfigurationReads,
  rulesFutureCompletions,
  rulesRootScopeLaunches,
  rulesUnboundedWaits,
  rulesHttpValues,
  rulesCleanupOrder,
  rulesAddOnlyProperties,
  rulesCachedDeferred,
  rulesPendingFutures,
  rulesTimerFields,
  rulesRepeatedStrings,
  rulesLogFormatRules,
  rulesSimplerLogic,
  rulesOperandSlips,
  rulesProcessWaits,
  rulesQueryRules,
  rulesRegexDefects,
  rulesRegexValues,
  rulesInlineCloseables,
  rulesCalls,
  rulesCatches,
  rulesDeclarations,
  rulesMarkers,
  rulesHardcodedSecrets,
  rulesSecretNames,
  rulesSecretsInLogs,
  rulesTests,
  rulesClients,
  rulesCrypto,
  rulesSql,
  rulesCompatibilityShims,
  rulesParameterMutation,
  rulesTriState,
  rulesDefaultTimeZone,
  rulesTimeUnits,
  rulesUriParsing,
];
