import * as helpers from './forwards';
import { publicTarget } from '../index';
import { forwards } from '../index';
import { target as renamed } from './forwards';
import { overloaded } from './overloads';

export function reExported(): string {
  return publicTarget('a', 1);
}

export function namespaced(): string {
  return helpers.target('a', 1);
}

export function namespacedReExport(): string {
  return forwards.target('a', 1);
}

export function aliased(): string {
  return renamed('a', 1);
}

export function overloads(): string {
  return overloaded('a') + String(overloaded(1));
}
