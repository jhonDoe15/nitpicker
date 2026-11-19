import type { ClassFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';

export type ClassIndex = Map<string, ClassFact>;
export type LockSite = { file: KotlinFile; view: ClassIndex };
