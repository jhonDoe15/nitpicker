import { readFileSync } from 'node:fs';
import { login } from '../domain/login.js';
export const load = (): string => login(readFileSync('x', 'utf8'));
