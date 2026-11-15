import { configFileGlobsFor as untypedConfigFileGlobsFor } from '../policy/production-policy.mjs';
import { domainGlobsFor as untypedDomainGlobsFor } from '../strict/strict-domain.mjs';
import { testAreaGlobsFor as untypedTestAreaGlobsFor } from '../strict-tests.mjs';
import type { ScopeLayout } from './config-types.mts';

export const configFileGlobsFor: (layout: ScopeLayout) => string[] = untypedConfigFileGlobsFor;

export const domainGlobsFor: (sourceRoots: readonly string[]) => string[] = untypedDomainGlobsFor;

export const testAreaGlobsFor: (layout: ScopeLayout) => string[] = untypedTestAreaGlobsFor;
