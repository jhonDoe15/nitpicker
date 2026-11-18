import type { ScopeKind } from './scope-types.mts';

export const TRANSACTION = 'transaction';
export const SQL_METHODS: ReadonlySet<string> = new Set(['query', 'execute', 'exec', 'raw', 'run']);
export const BEGIN_TEXT = /^\s*(?:BEGIN|START\s+TRANSACTION)\b/iu;
export const END_TEXT = /^\s*(?:COMMIT|ROLLBACK)\b/iu;
export const SCOPES: Readonly<
  Record<
    ScopeKind,
    {
      readonly callbacks: ReadonlySet<string>;
      readonly begins: ReadonlySet<string>;
      readonly ends: ReadonlySet<string>;
    }
  >
> = {
  transaction: {
    callbacks: new Set(['$transaction', TRANSACTION, 'transactional']),
    begins: new Set(['startTransaction', 'beginTransaction', TRANSACTION]),
    ends: new Set(['commit', 'commitTransaction', 'rollback', 'rollbackTransaction']),
  },
  lock: {
    callbacks: new Set(['runExclusive', 'acquire', 'request', 'using']),
    begins: new Set(['acquire']),
    ends: new Set(['release', 'unlock', 'releaseLock']),
  },
};
