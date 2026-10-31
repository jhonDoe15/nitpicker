import type { Settings } from '../model';
import { route } from './route';

export function configure(settings: Settings): string {
  return `${settings.host}${route(settings)}`;
}
