import { diffTrees } from '../../tree.mjs';
import { changedGateLines, isBuildFile } from './build-files.mjs';
import { changedSections, hasSections } from './sections.mjs';

const GATE_TAMPERING = 'gate-tampering';

// Files whose every setting belongs to a quality tool, so any change to one is a change to the gate.
const TOOL_FILES = [
  /(?:^|\/)\.?ruff\.toml$/u,
  /(?:^|\/)\.?mypy\.ini$/u,
  /(?:^|\/)pyrightconfig\.json$/u,
  /(?:^|\/)\.basedpyright\//u,
  /(?:^|\/)\.importlinter$/u,
  /(?:^|\/)\.coveragerc$/u,
  /(?:^|\/)pytest\.ini$/u,
  /(?:^|\/)\.flake8$/u,
  /(?:^|\/)\.?pylintrc$/u,
  /(?:^|\/)\.isort\.cfg$/u,
  /(?:^|\/)mutmut_config\.py$/u,
  /(?:^|\/)\.editorconfig$/u,
  /(?:^|\/)detekt[\w.-]*\.ya?ml$/u,
  /(?:^|\/)config\/(?:pmd|checkstyle|detekt|spotbugs|ktlint)\//u,
  /(?:^|\/)(?:checkstyle|pmd|spotbugs)[\w.-]*\.xml$/u,
  /(?:^|\/)archunit\.properties$/u,
];

const isToolFile = (file) => TOOL_FILES.some((pattern) => pattern.test(file));

const edit = (kind, file, detail) => ({ category: GATE_TAMPERING, kind, path: file, detail });

function toolFileEdits({ added, removed, modified }) {
  return [
    ...added
      .filter(isToolFile)
      .map((file) => edit('config-edit', file, 'added gate configuration file')),
    ...removed
      .filter(isToolFile)
      .map((file) => edit('config-edit', file, 'removed gate configuration file')),
    ...modified
      .filter(isToolFile)
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
 * pytest.ini, detekt.yml, config/pmd, config/checkstyle, .editorconfig and similar), the tool
 * sections of pyproject.toml (`tool.ruff`, `tool.mypy`, `tool.pyright`, `tool.coverage`,
 * `tool.pytest`, `tool.mutmut`, `tool.importlinter` and the like), and the tool sections of
 * setup.cfg and tox.ini. Registering a pytest marker is not one. A build file change is a
 * `build-config-edit` only when it touches a test, coverage or analysis setting (see
 * `gateLinesOf`); a new dependency or plugin the task needs is not reported.
 */
export function detectLanguageConfigEdits(fixtureTree, finalTree) {
  const changes = diffTrees(fixtureTree, finalTree);
  const files = [...changes.added, ...changes.removed, ...changes.modified];
  const context = { fixtureTree, finalTree, files };
  return [...toolFileEdits(changes), ...sectionEdits(context), ...buildEdits(context)];
}
