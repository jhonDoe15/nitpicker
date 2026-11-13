import type { Shortcut, Tree } from '../../common/types.mts';
import { diffTrees, type TreeChanges } from '../../tree.mts';
import { isBuildFile, isToolConfigFile } from '../project-files.mts';
import { changedGateLines } from './build/index.mts';
import { changedSections, hasSections } from './sections.mts';

const GATE_TAMPERING = 'gate-tampering';

type EditContext = { fixtureTree: Tree; finalTree: Tree; files: readonly string[] };

function edit(kind: string, file: string, detail: string): Shortcut {
  return { category: GATE_TAMPERING, kind, path: file, detail };
}

function toolFileEdits({ added, removed, modified }: TreeChanges): Shortcut[] {
  return [
    ...added
      .filter(isToolConfigFile)
      .map((file) => edit('config-edit', file, 'added gate configuration file')),
    ...removed
      .filter(isToolConfigFile)
      .map((file) => edit('config-edit', file, 'removed gate configuration file')),
    ...modified
      .filter(isToolConfigFile)
      .map((file) => edit('config-edit', file, 'modified gate configuration file')),
  ];
}

function sectionEdits({ fixtureTree, finalTree, files }: EditContext): Shortcut[] {
  return files.filter(hasSections).flatMap((file) => {
    const names = changedSections(file, fixtureTree.get(file), finalTree.get(file));
    return names.length === 0
      ? []
      : [edit('config-edit', file, `changed ${names.join(', ')} in ${file}`)];
  });
}

function buildEdits({ fixtureTree, finalTree, files }: EditContext): Shortcut[] {
  return files.filter(isBuildFile).flatMap((file) => {
    const { added, removed } = changedGateLines(file, fixtureTree.get(file), finalTree.get(file));
    const shown = [...added.map((line) => `+ ${line}`), ...removed.map((line) => `- ${line}`)];
    return shown.length === 0
      ? []
      : [
          edit(
            'build-config-edit',
            file,
            `test, coverage or analysis settings changed: ${shown.slice(0, 3).join('; ')}`,
          ),
        ];
  });
}

export function detectLanguageConfigEdits(fixtureTree: Tree, finalTree: Tree): Shortcut[] {
  const changes = diffTrees(fixtureTree, finalTree);
  const files = [...changes.added, ...changes.removed, ...changes.modified];
  const context = { fixtureTree, finalTree, files };
  return [...toolFileEdits(changes), ...sectionEdits(context), ...buildEdits(context)];
}
