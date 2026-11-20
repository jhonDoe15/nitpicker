import { existingRoots as untypedExistingRoots } from '../../layout.mts';
import { cruise as untypedCruise } from '../cruise.mts';

export const cruise: (paths: readonly string[]) => unknown = untypedCruise;

export const existingRoots: (projectRoot: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;
