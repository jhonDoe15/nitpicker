import { existingRoots as untypedExistingRoots } from '../../layout.mjs';
import { cruise as untypedCruise } from '../cruise.mjs';

export const cruise: (paths: readonly string[]) => unknown = untypedCruise;

export const existingRoots: (projectRoot: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;
