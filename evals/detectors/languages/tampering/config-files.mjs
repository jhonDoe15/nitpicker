import { diffTrees } from '../../tree.mjs';
import { isBuildFile, isToolConfigFile } from '../project-files.mjs';
import { changedGateLines } from './build/index.mjs';
import { changedSections, hasSections } from './sections.mjs';

const GATE_TAMPERING = 'gate-tampering';

const edit = (kind, file, detail) => ({ category: GATE_TAMPERING, kind, path: file, detail });

function toolFileEdits({ added, removed, modified }) {
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

function sectionEdits({ fixtureTree, finalTree, files }) {
  return files.filter(hasSections).flatMap((file) => {
    const names = changedSections(file, fixtureTree.get(file), finalTree.get(file));
    return names.length === 0
      ? []
      : [edit('config-edit', file, `changed ${names.join(', ')} in ${file}`)];
  });
}

function buildEdits({ fixtureTree, finalTree, files }) {
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

/**
 * Edits to the configuration of Python, Java and Kotlin quality tools, reported as `config-edit`:
 * a tool's own file (ruff.toml, mypy.ini, pyrightconfig.json, .importlinter, .coveragerc,
 * pytest.ini, detekt.yml, detekt-baseline.xml, config/pmd, config/checkstyle and similar), the tool
 * sections of pyproject.toml (`tool.ruff`, `tool.mypy`, `tool.pyright`, `tool.coverage`,
 * `tool.pytest`, `tool.mutmut`, `tool.importlinter` and the like), the tool sections and the
 * `[testenv] commands` of setup.cfg and tox.ini, and the ktlint and line-length keys of
 * .editorconfig. Registering a pytest marker or setting its `pythonpath` is not one. A build file change is a
 * `build-config-edit` only when it touches a test, coverage or analysis setting (see
 * `gateLinesOf`); a new dependency or plugin the task needs is not reported.
 */
export function detectLanguageConfigEdits(fixtureTree, finalTree) {
  const changes = diffTrees(fixtureTree, finalTree);
  const files = [...changes.added, ...changes.removed, ...changes.modified];
  const context = { fixtureTree, finalTree, files };
  return [...toolFileEdits(changes), ...sectionEdits(context), ...buildEdits(context)];
}
