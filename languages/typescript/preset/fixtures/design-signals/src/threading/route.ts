import type { Settings } from '../model';

export function route(settings: Settings): string {
  return String(settings.port);
}
