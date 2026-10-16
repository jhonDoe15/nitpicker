import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MESSAGES, RULE_IDS, renderMessage } from '../../../../shared/policy.mjs';
import { exceptionMatcher, exceptionText } from '../../../../shared/rules/exceptions.mjs';
import { readDependencyNames, storySuffixes } from '../eslint-config/scope-support.mjs';
import { codeExtensionNames } from '../layout.mjs';
import { DEFAULT_EXPORT, exportedComponents } from '../syntax/exported-components.mjs';

const COMPONENT_EXTENSIONS = codeExtensionNames.filter((name) => !/^[cm]?ts$/u.test(name));
const STORY_FILE = new RegExp(
  `^(.+)\\.(?:${storySuffixes.join('|')})\\.(?:${codeExtensionNames.join('|')})$`,
  'u',
);
const STORY_FOLDER_SEGMENT = /(?:^|\/)(?:__stories__|stories)\//u;
const STORYBOOK_PACKAGE = /^(?:storybook|@storybook\/.+)$/u;
const INDEX_FILE = /^index\./u;
const RULE = RULE_IDS.componentStoryMissing;

function packageDirectoryOf(projectRoot, file, cache) {
  const directories = path.posix
    .dirname(file)
    .split('/')
    .filter((segment) => segment !== '.')
    .map((_, index, segments) => segments.slice(0, segments.length - index).join('/'));
  const directory = [...directories, '.'].find((candidate) => {
    if (!cache.has(candidate)) {
      cache.set(candidate, existsSync(path.join(projectRoot, candidate, 'package.json')));
    }
    return cache.get(candidate);
  });
  return directory ?? '.';
}

function stemOf(file) {
  const name = path.posix.basename(file);
  return INDEX_FILE.test(name)
    ? path.posix.basename(path.posix.dirname(file))
    : name.slice(0, name.lastIndexOf('.'));
}

function storyNamesOf({ file, components }) {
  const stem = stemOf(file);
  return [stem, ...components.map(({ name }) => (name === DEFAULT_EXPORT ? stem : name))];
}

function storyKey(directory, name) {
  return `${directory}\0${name}`;
}

function componentFile(projectRoot, file, directory) {
  const text = readFileSync(path.join(projectRoot, file), 'utf8');
  const components = exportedComponents(text, file);
  return components.length === 0 ? [] : [{ file, components, directory }];
}

function isComponentCandidate(file, isExcepted) {
  return (
    COMPONENT_EXTENSIONS.includes(path.posix.extname(file).slice(1)) &&
    !STORY_FOLDER_SEGMENT.test(file) &&
    !isExcepted(RULE, file)
  );
}

function scanProject(projectRoot, layout, isExcepted) {
  const manifests = new Map();
  const entries = layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter((file) => layout.isSourceFile(file))
    .map((file) => ({
      file,
      directory: packageDirectoryOf(projectRoot, file, manifests),
      story: STORY_FILE.exec(path.posix.basename(file)),
    }));
  const stories = new Set(
    entries
      .filter(({ story }) => story !== null)
      .map(({ directory, story }) => storyKey(directory, story[1])),
  );
  const components = entries
    .filter(({ file, story }) => story === null && isComponentCandidate(file, isExcepted))
    .flatMap(({ file, directory }) => componentFile(projectRoot, file, directory));
  return { components, stories };
}

function hasStory(stories, component) {
  return storyNamesOf(component).some((name) => stories.has(storyKey(component.directory, name)));
}

function storybookScope(projectRoot, { components, stories }) {
  const directories = new Set(
    components
      .map(({ directory }) => directory)
      .filter((directory) =>
        readDependencyNames(path.join(projectRoot, directory)).some((name) =>
          STORYBOOK_PACKAGE.test(name),
        ),
      ),
  );
  const scoped = components.filter(({ directory }) => directories.has(directory));
  const withStories = scoped.filter((component) => hasStory(stories, component));
  return { directories, enforced: withStories.length * 2 > scoped.length };
}

function findingsFor({ file, components }, { analyzerName, enforced }) {
  const stem = stemOf(file);
  const fileHasStem = components.some(({ name }) => name === stem || name === DEFAULT_EXPORT);
  const template = enforced
    ? MESSAGES.componentStoryMissing
    : MESSAGES.componentStoryMissingUnenforced;
  const exception = exceptionText(RULE, file);
  return components.map(({ name: exported, line }) => {
    const name = exported === DEFAULT_EXPORT ? stem : exported;
    const story = file.replace(
      /[^/]+$/u,
      `${fileHasStem ? stem : name}.stories${path.posix.extname(file)}`,
    );
    return {
      tool: analyzerName,
      rule: RULE,
      path: file,
      identity: `${RULE}:${name}`,
      location: { line },
      message: renderMessage(template, { story, name, exception }),
      classification: enforced ? 'enforceable' : 'descriptive',
    };
  });
}

export function componentStoryFindings({
  projectRoot,
  liveProjectRoot = projectRoot,
  analyzerName,
  layout,
  exceptions,
}) {
  const isExcepted = exceptionMatcher(exceptions);
  const current = scanProject(projectRoot, layout, isExcepted);
  const live =
    liveProjectRoot === projectRoot ? current : scanProject(liveProjectRoot, layout, isExcepted);
  const { directories, enforced } = storybookScope(liveProjectRoot, live);
  return current.components
    .filter(({ directory }) => directories.has(directory))
    .filter((component) => !hasStory(current.stories, component))
    .flatMap((component) => findingsFor(component, { analyzerName, enforced }));
}
