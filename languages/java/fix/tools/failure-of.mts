import { failureText } from '../../../../core/fix/tool-steps/commands/fix-command.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

export function failureOf(result: unknown): string {
  const stderr = fieldOf(result, 'stderr');
  const status = fieldOf(result, 'status');
  const message = fieldOf(fieldOf(result, 'error'), 'message');
  return failureText({
    ...(typeof stderr === 'string' ? { stderr } : {}),
    ...(typeof status === 'number' || status === null ? { status } : {}),
    ...(typeof message === 'string' ? { error: { message } } : {}),
  });
}
