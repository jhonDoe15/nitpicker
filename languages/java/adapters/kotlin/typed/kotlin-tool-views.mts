import { existsSync } from 'node:fs';
import { resolveInside as untypedResolveInside } from '../../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig as untypedMissingProjectConfig,
  precedenceLayers as untypedPrecedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { troubleshootingError as untypedTroubleshootingError } from '../../../../../shared/messages/troubleshooting.mjs';

const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;
export const missingProjectConfig: (tool: string, looked: string) => string =
  untypedMissingProjectConfig;
export const precedenceLayers: (precedence: string[] | undefined) => {
  usesProject: boolean;
  nitpickerFirst: boolean;
} = untypedPrecedenceLayers;
export const troubleshootingError: (message: string, anchor: string) => Error =
  untypedTroubleshootingError;

export function existingInside(root: string, files: readonly string[]): string[] {
  return files
    .map((file) => resolveInside(root, file))
    .flatMap((file) => (file !== undefined && existsSync(file) ? [file] : []));
}
