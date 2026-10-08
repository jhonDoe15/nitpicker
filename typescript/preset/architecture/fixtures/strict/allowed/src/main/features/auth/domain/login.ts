import { join } from 'node:path';
import { hash } from '../../../shared/hash.js';
export const login = (name: string): string => join(hash(name), name);
