import { appendFileSync } from 'node:fs';
import { attempt } from '../../../../../shared/values/attempt/attempt.mts';
import { hostEnvironment } from './host-environment.config.mts';

export function traceHosting(outcome: string, mainClass: string): void {
  const file = hostEnvironment().traceFile;
  if (file === undefined || file === '') {
    return;
  }
  attempt(() => {
    appendFileSync(file, `${outcome} ${mainClass}\n`);
  });
}
