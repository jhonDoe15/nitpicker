import { missingProjectConfig } from '../typed/kotlin-tool-views.mts';
import { type Workspace, projectEditorconfigs } from './editorconfig-mirror.mts';

export function ktlintWorkspace(configRoot: string): Workspace & { files: string[] } {
  const found = projectEditorconfigs(configRoot);
  if (found.editorconfigs.length === 0) {
    throw new Error(
      missingProjectConfig(
        'ktlint',
        `an .editorconfig (searched ${configRoot}, its subfolders and its parents up to the repository root)`,
      ),
    );
  }
  return found;
}
