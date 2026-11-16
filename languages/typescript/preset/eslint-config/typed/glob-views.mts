import { configFileGlobsFor as untypedConfigFileGlobsFor } from '../policy/production-policy.mts';
import { domainGlobsFor as untypedDomainGlobsFor } from '../strict/strict-domain.mts';
import { testAreaGlobsFor as untypedTestAreaGlobsFor } from '../strict-tests.mts';
import type { ScopeLayout } from './config-types.mts';

export const configFileGlobsFor: (layout: ScopeLayout) => string[] = untypedConfigFileGlobsFor;

export const domainGlobsFor: (sourceRoots: readonly string[]) => string[] = untypedDomainGlobsFor;

export const testAreaGlobsFor: (layout: ScopeLayout) => string[] = untypedTestAreaGlobsFor;
