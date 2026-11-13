import { kotlinSourceRules as rulesResourceLifetime } from '../../review-rules/coroutines/resource-lifetime.mjs';
import { kotlinSourceRules as rulesSuspendCleanup } from '../../review-rules/coroutines/suspend-cleanup.mjs';
import { kotlinSourceRules as rulesFanOut } from '../../review-rules/main/fan-out/fan-out.mjs';
import { kotlinSourceRules as rulesUnsafeCasts } from '../casts/unsafe-casts.mjs';
import { kotlinSourceRules as rulesCostlyCollections } from '../collections/costly-collections.mjs';
import { kotlinSourceRules as rulesConfigurationReads } from '../configuration/configuration-reads.mjs';
import { kotlinSourceRules as rulesFutureCompletions } from '../futures/future-completions.mjs';
import { kotlinSourceRules as rulesCleanupOrder } from '../lifecycles/cleanup/cleanup-order.mjs';
import { kotlinSourceRules as rulesRepeatedStrings } from '../literals/repeated-strings.mjs';
import { kotlinSourceRules as rulesLogFormatRules } from '../logging/log-format-rules.mjs';
import { kotlinSourceRules as rulesSimplerLogic } from '../logic/simpler-logic.mjs';
import { kotlinSourceRules as rulesOperandSlips } from '../operands/operand-slips.mjs';
import { kotlinSourceRules as rulesProcessWaits } from '../processes/process-waits.mjs';
import { kotlinSourceRules as rulesQueryRules } from '../queries/query-rules.mjs';
import { kotlinSourceRules as rulesRegexDefects } from '../regexes/regex-defects.mjs';
import { kotlinSourceRules as rulesRegexValues } from '../regexes/regex-values.mjs';
import { kotlinSourceRules as rulesInlineCloseables } from '../resources/inline-closeables.mjs';
import { kotlinSourceRules as rulesCalls } from './calls.mjs';
import { kotlinSourceRules as rulesCatches } from './catches.mjs';
import { kotlinSourceRules as rulesDeclarations } from './declarations.mjs';
import { kotlinSourceRules as rulesMarkers } from './markers.mjs';
import { kotlinSourceRules as rulesHardcodedSecrets } from './secrets/hardcoded-secrets.mjs';
import { kotlinSourceRules as rulesSecretNames } from './secrets/secret-names.mjs';
import { kotlinSourceRules as rulesSecretsInLogs } from './secrets/secrets-in-logs.mjs';
import { kotlinSourceRules as rulesTests } from './tests.mjs';
import { kotlinSourceRules as rulesClients } from '../security/clients.mjs';
import { kotlinSourceRules as rulesCrypto } from '../security/crypto.mjs';
import { kotlinSourceRules as rulesSql } from '../security/sql.mjs';
import { kotlinSourceRules as rulesCompatibilityShims } from '../signatures/compatibility-shims.mjs';
import { kotlinSourceRules as rulesParameterMutation } from '../signatures/parameter-mutation.mjs';
import { kotlinSourceRules as rulesTriState } from '../signatures/tri-state.mjs';
import { kotlinSourceRules as rulesDefaultTimeZone } from '../time/default-time-zone.mjs';
import { kotlinSourceRules as rulesTimeUnits } from '../time/units/time-units.mjs';
import { kotlinSourceRules as rulesUriParsing } from '../uris/uri-parsing.mjs';

export const directoryRules = [
  rulesResourceLifetime,
  rulesSuspendCleanup,
  rulesFanOut,
  rulesUnsafeCasts,
  rulesCostlyCollections,
  rulesConfigurationReads,
  rulesFutureCompletions,
  rulesCleanupOrder,
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
