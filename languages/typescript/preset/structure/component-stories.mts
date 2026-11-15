import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../adapters/static-checks/shared.mts';
import {
  MESSAGES,
  RULE_IDS,
  codeExtensionNames,
  exceptionMatcher,
  exceptionText,
  messageFields,
} from './typed/rule-views.mts';
import {
  DEFAULT_EXPORT,
  exportedComponents,
  isStorybookPackage,
  readDependencyNames,
  storySuffixes,
} from './typed/story-views.mts';
import type { StoryComponent, StructureLayout } from './typed/structure-types.mts';

type ComponentFile = {
  readonly file: string;
  readonly components: readonly StoryComponent[];
  readonly directory: string;
};

type IsExcepted = (rule: string, ...candidates: readonly string[]) => boolean;

type Scan = {
  readonly components: ComponentFile[];
  readonly stories: Set<string>;
};

const COMPONENT_EXTENSIONS = codeExtensionNames.filter((name) => !/^[cm]?ts$/u.test(name));
const STORY_FILE = new RegExp(
  `^(.+)\\.(?:${storySuffixes.join('|')})\\.(?:${codeExtensionNames.join('|')})$`,
  'u',
);
const STORY_FOLDER_SEGMENT = /(?:^|\/)(?:__stories__|stories)\//u;
const INDEX_FILE = /^index\./u;
const RULE = RULE_IDS.componentStoryMissing;

function packageDirectoryOf(
  projectRoot: string,
  file: string,
  cache: Map<string, boolean>,
): string {
  const directories = path.posix
    .dirname(file)
    .split('/')
    .filter((segment) => segment !== '.')
    .map((_, index, segments) => segments.slice(0, segments.length - index).join('/'));
  const directory = [...directories, '.'].find((candidate) => {
    if (!cache.has(candidate)) {
      cache.set(candidate, existsSync(path.join(projectRoot, candidate, 'package.json')));
    }
    return cache.get(candidate) === true;
  });
  return directory ?? '.';
}

function stemOf(file: string): string {
  const name = path.posix.basename(file);
  return INDEX_FILE.test(name)
    ? path.posix.basename(path.posix.dirname(file))
    : name.slice(0, name.lastIndexOf('.'));
}

function storyNamesOf({ file, components }: ComponentFile): string[] {
  const stem = stemOf(file);
  return [stem, ...components.map(({ name }) => (name === DEFAULT_EXPORT ? stem : name))];
}

function storyKey(directory: string, name: string): string {
  return `${directory}\0${name}`;
}

function componentFile(projectRoot: string, file: string, directory: string): ComponentFile[] {
  const text = readFileSync(path.join(projectRoot, file), 'utf8');
  const components = exportedComponents(text, file);
  return components.length === 0 ? [] : [{ file, components, directory }];
}

function isComponentCandidate(file: string, isExcepted: IsExcepted): boolean {
  return (
    COMPONENT_EXTENSIONS.includes(path.posix.extname(file).slice(1)) &&
    !STORY_FOLDER_SEGMENT.test(file) &&
    !isExcepted(RULE, file)
  );
}

function scanProject(projectRoot: string, layout: StructureLayout, isExcepted: IsExcepted): Scan {
  const manifests = new Map<string, boolean>();
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
      .map(({ directory, story }) =>
        story === null ? undefined : storyKey(directory, story[1] ?? ''),
      )
      .filter((key) => key !== undefined),
  );
  const components = entries
    .filter(({ file, story }) => story === null && isComponentCandidate(file, isExcepted))
    .flatMap(({ file, directory }) => componentFile(projectRoot, file, directory));
  return { components, stories };
}

function hasStory(stories: ReadonlySet<string>, component: ComponentFile): boolean {
  return storyNamesOf(component).some((name) => stories.has(storyKey(component.directory, name)));
}

function storybookScope(
  projectRoot: string,
  { components, stories }: Scan,
): { directories: Set<string>; enforced: boolean } {
  const directories = new Set(
    components
      .map(({ directory }) => directory)
      .filter((directory) =>
        readDependencyNames(path.join(projectRoot, directory)).some((name) =>
          isStorybookPackage(name),
        ),
      ),
  );
  const scoped = components.filter(({ directory }) => directories.has(directory));
  const withStories = scoped.filter((component) => hasStory(stories, component));
  return { directories, enforced: withStories.length * 2 > scoped.length };
}

function findingsFor(
  { file, components }: ComponentFile,
  { analyzerName, enforced }: { analyzerName: string; enforced: boolean },
): Finding[] {
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
      ...messageFields(template, { story, name, exception }),
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
}: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly analyzerName: string;
  readonly layout: StructureLayout;
  readonly exceptions: unknown[];
}): Finding[] {
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
