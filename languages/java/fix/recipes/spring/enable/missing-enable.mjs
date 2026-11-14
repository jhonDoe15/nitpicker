import path from 'node:path';
import { blankLiterals } from '../../../../adapters/review-rules/java-sources.mjs';
import { springWiringProblems } from '../../../../adapters/spring/wiring/spring-wiring.mjs';
import { projectFilesUnder } from '../../../../../../shared/project-files/project-files.mjs';
import { enableInsertions, featureOf } from './enable-edits.mjs';

const SOURCE_FILE = /\.(?:java|kt)$/;
const MAIN_SOURCE = /^(.*?)src\/main\/(?:java|kotlin)\//;
const BOOT_APPLICATION = /@\s*(?:\w+\s*\.\s*)*SpringBootApplication\b/g;
const SECURED = 'org.springframework.security.access.annotation.Secured';
const RESILIENCE = 'org.springframework.resilience.';

function applicationClasses(projectRoot, prefix, read) {
  return ['java', 'kotlin']
    .flatMap((kind) => projectFilesUnder(path.join(projectRoot, `${prefix}src/main/${kind}`)))
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))
    .flatMap((name) => {
      const text = read(name);
      const code = text === undefined ? '' : blankLiterals(text);
      const found = [...code.matchAll(BOOT_APPLICATION)];
      return found.length === 0 ? [] : [{ path: name, text, at: found[0].index }];
    });
}

function featureFor(key, users) {
  const feature = featureOf(key);
  if (
    feature === undefined ||
    (key === 'enable-retry' && users.some((t) => t.includes(RESILIENCE)))
  ) {
    return undefined;
  }
  const secured = key === 'enable-methodsecurity' && users.some((text) => text.includes(SECURED));
  return secured ? { ...feature, args: '(securedEnabled = true)' } : feature;
}

function usersOf(problems, key, read) {
  return problems
    .filter((problem) => problem.key === key)
    .map(({ path: name }) => read(name) ?? '');
}

function moduleFix({ problems, application, read, accepts }) {
  const keys = [...new Set(problems.map(({ key }) => key))];
  const features = keys
    .map((key) => featureFor(key, usersOf(problems, key, read)))
    .filter((feature) => feature !== undefined);
  if (features.length === 0 || !accepts(application.path)) {
    return undefined;
  }
  const semicolon = application.path.endsWith('.kt') ? '' : ';';
  const first = problems[0];
  return {
    finding: { tool: 'spring', rule: 'missing-enable', path: first.path, line: first.line },
    edits: enableInsertions({
      text: application.text,
      annotationAt: application.at,
      features,
      semicolon,
    }).map(({ offset, text }) => ({
      type: 'replace',
      path: application.path,
      start: offset,
      end: offset,
      text,
    })),
  };
}

function planModule(prefix, changed, { projectRoot, read, accepts }) {
  const problems = springWiringProblems(
    projectRoot,
    [`${prefix}src/main/java`, `${prefix}src/main/kotlin`],
    [`${prefix}src/main/resources`],
  ).filter(({ path: name }) => changed.has(name));
  if (problems.length === 0) {
    return { fixes: [], notes: [] };
  }
  const applications = applicationClasses(projectRoot, prefix, read);
  if (applications.length !== 1) {
    return {
      fixes: [],
      notes: [
        `spring/missing-enable in ${prefix === '' ? '.' : prefix}: left as is, ${applications.length === 0 ? 'no' : 'more than one'} @SpringBootApplication class found`,
      ],
    };
  }
  const fix = moduleFix({ problems, application: applications[0], read, accepts });
  return { fixes: fix === undefined ? [] : [fix], notes: [] };
}

export const missingEnableRecipe = {
  id: 'spring-missing-enable',
  rules: [{ tool: 'spring', rule: 'missing-enable' }],
  presets: ['java', 'kotlin'],
  scope: 'project',
  safety: 'review',
  plan({ files, read, projectRoot, accepts }) {
    const changed = new Set(files.map(({ path: name }) => name));
    const prefixes = [
      ...new Set([...changed].flatMap((name) => MAIN_SOURCE.exec(name)?.slice(1, 2) ?? [])),
    ];
    const planned = prefixes.map((prefix) =>
      planModule(prefix, changed, { projectRoot, read, accepts }),
    );
    return {
      fixes: planned.flatMap(({ fixes }) => fixes),
      notes: planned.flatMap(({ notes }) => notes),
    };
  },
};
