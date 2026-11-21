import path from 'node:path';
import { chainOf } from '../../traversal.mjs';
import { parsedToml, readSmallText, tableOf } from './cargo-crates.mjs';

const MUSL_TARGET = /\b[a-z0-9_]+-(?:unknown-)?linux-musl[a-z0-9_]*\b/u;
const ALPINE_RUST = /^FROM\s+(?:--\S+\s+)*(?:\S+\/)?rust:\S*alpine/iu;
const STAGE_START = /^FROM\s/iu;
const CARGO_BUILD =
  /\b(?:cargo(?:\s+\+\S+)?\s+(?:build|zigbuild|rustc|auditable\s+build)|cross\s+build)\b/u;
const CARGO_INSTALL = /\b(?:cargo|cross)\s+install\b/u;
const NAME_SELECTOR = /(?:^|\s)(?:-p|--package|--bin)(?:\s+|=)["']?([\w-]+)/gu;
const MANIFEST_SELECTOR = /--manifest-path(?:\s+|=)["']?([\w./-]+)/gu;
const WHOLE_WORKSPACE = /(?:^|\s)(?:--workspace|--all)\b/u;
const CHANGE_DIRECTORY = /(?:^|[;&|]\s*)cd\s+["']?([\w./-]+)["']?\s*(?:&&|;)[^;&|]*\bcargo\b/u;
const COMMAND_BREAK = /&&|\|\||[;|]/u;
const COMMENT = /(?:^|\s)#.*$/u;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.ya?ml$/u;
const DOCKERFILE = /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile|Containerfile)$/u;
const BUILD_FILES = /^(?:Makefile|justfile|Justfile|package\.json|.+\.sh)$/u;
const CARGO_CONFIG = /(?:^|\/)\.cargo\/config(?:\.toml)?$/u;

function logicalLines(text) {
  return text
    .replaceAll(/\\\r?\n/gu, ' ')
    .split(/\r?\n/u)
    .map((line) => line.replace(COMMENT, '').trim());
}

function selectorsOf(line, directory) {
  return {
    names: [...line.matchAll(NAME_SELECTOR)].map(([, name]) => name),
    manifests: [...line.matchAll(MANIFEST_SELECTOR)].map(([, manifest]) =>
      path.posix.dirname(path.posix.normalize(path.posix.join(directory, manifest))),
    ),
    wholeWorkspace: WHOLE_WORKSPACE.test(line),
  };
}

function lineDirectory(line, directory) {
  const moved = CHANGE_DIRECTORY.exec(line)?.[1];
  return moved === undefined ? directory : path.posix.normalize(path.posix.join(directory, moved));
}

function scriptBuilds(file, text, directory) {
  const isDockerfile = DOCKERFILE.test(path.posix.basename(file));
  let alpine = false;
  return logicalLines(text).flatMap((line) => {
    if (isDockerfile && STAGE_START.test(line)) {
      alpine = ALPINE_RUST.test(line);
    }
    const builds = line
      .split(COMMAND_BREAK)
      .some(
        (command) =>
          CARGO_BUILD.test(command) &&
          !CARGO_INSTALL.test(command) &&
          (alpine || MUSL_TARGET.test(command)),
      );
    if (!builds) {
      return [];
    }
    const lineDir = lineDirectory(line, directory);
    return [{ file, directory: lineDir, ...selectorsOf(line, lineDir) }];
  });
}

function configTargets(projectRoot, file) {
  const target = tableOf(tableOf(parsedToml(projectRoot, file)).build).target;
  return (Array.isArray(target) ? target : [target]).filter((item) => typeof item === 'string');
}

function buildsOf(projectRoot, file) {
  if (CARGO_CONFIG.test(file)) {
    return configTargets(projectRoot, file).some((target) => MUSL_TARGET.test(target))
      ? [
          {
            file,
            directory: path.posix.dirname(path.posix.dirname(file)),
            names: [],
            manifests: [],
            wholeWorkspace: false,
          },
        ]
      : [];
  }
  const base = path.posix.basename(file);
  const workflow = WORKFLOW.test(file);
  const buildScript = workflow || DOCKERFILE.test(base) || BUILD_FILES.test(base);
  if (!buildScript) {
    return [];
  }
  const text = readSmallText(projectRoot, file);
  if (text === undefined) {
    return [];
  }
  const builds = scriptBuilds(file, text, workflow ? '.' : path.posix.dirname(file));
  return workflow && text.includes('working-directory')
    ? builds.filter(({ names, manifests }) => names.length > 0 || manifests.length > 0)
    : builds;
}

export function muslBuilds(projectRoot, files) {
  return files.flatMap((file) => buildsOf(projectRoot, file));
}

function memberPattern(folder, member) {
  const full = path.posix.normalize(path.posix.join(folder, member));
  const source = full
    .split('/')
    .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]+'))
    .join('/');
  return new RegExp(`^${source}$`, 'u');
}

function membersOf(entry, crates, useDefault) {
  const workspace = tableOf(entry.manifest.workspace);
  const listed =
    Array.isArray(workspace['default-members']) && useDefault
      ? workspace['default-members']
      : workspace.members;
  const included = (Array.isArray(listed) ? listed : []).map((member) =>
    memberPattern(entry.folder, String(member)),
  );
  const excluded = (Array.isArray(workspace.exclude) ? workspace.exclude : []).map((member) =>
    memberPattern(entry.folder, String(member)),
  );
  return crates.filter(
    ({ folder }) =>
      (folder === entry.folder || included.some((pattern) => pattern.test(folder))) &&
      !excluded.some((pattern) => pattern.test(folder)),
  );
}

function nearestManifest(directory, manifests) {
  const byFolder = new Map(manifests.map((entry) => [entry.folder, entry]));
  const folders = chainOf(directory, (current) =>
    current === '.' || current === '' ? undefined : path.posix.dirname(current),
  );
  return folders.map((folder) => byFolder.get(folder)).find((found) => found !== undefined);
}

function defaultCrates(entry, crates, wholeWorkspace) {
  const own = crates.filter(({ folder }) => folder === entry.folder);
  if (entry.manifest.workspace === undefined) {
    return own;
  }
  if (wholeWorkspace) {
    return membersOf(entry, crates, false);
  }
  return own.length > 0 ? own : membersOf(entry, crates, true);
}

export function builtCrates(build, manifests, crates) {
  if (build.names.length > 0) {
    return crates.filter(
      (crate) =>
        build.names.includes(crate.name) ||
        crate.roots.some((root) => build.names.includes(path.posix.basename(root, '.rs'))),
    );
  }
  const directories = build.manifests.length > 0 ? build.manifests : [build.directory];
  return directories.flatMap((directory) => {
    const entry = nearestManifest(directory, manifests);
    return entry === undefined ? [] : defaultCrates(entry, crates, build.wholeWorkspace);
  });
}
