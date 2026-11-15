import { textsOf } from '../../../../../../shared/values/readers.mts';
import {
  regexpRuleIds as untypedRegexpRuleIds,
  regexpRules as untypedRegexpRules,
} from '../../regexp/regexp-rules.mjs';

export const regexpRuleIds: string[] = textsOf(untypedRegexpRuleIds);

export const regexpRules: () => Record<string, string | [string, object]> = untypedRegexpRules;
