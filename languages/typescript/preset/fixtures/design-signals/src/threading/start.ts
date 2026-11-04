import type { Settings } from '../model';
import { configure } from './configure';

export function start(settings: Settings): string {
  return configure(settings);
}
