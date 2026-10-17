const TEST_DIRECTORIES = new Set(['tests', 'test']);
const ALSO_TESTS = ['test_*.py', '*_test.py', 'tests.py', 'tests_*.py', '*_tests.py'];
const VALUE_FLAGS = ['--deselect', '--ignore', '--ignore-glob'];

const REGEXP_SPECIALS = /[.+^${}()|[\]\\]/gu;

export function matchesGlob(name, pattern) {
  const source = pattern
    .replaceAll(REGEXP_SPECIALS, String.raw`\$&`)
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${source}$`, 'su').test(name);
}

function matchesAny(name, patterns) {
  return patterns.some((pattern) => matchesGlob(name, pattern));
}

export function isTestFile(file, { pythonFiles }) {
  const parts = file.split('/');
  const name = parts.at(-1) ?? '';
  const patterns = [...pythonFiles, ...ALSO_TESTS];
  return (
    name === 'conftest.py' ||
    parts.slice(0, -1).some((part) => TEST_DIRECTORIES.has(part)) ||
    matchesAny(name, patterns)
  );
}

function flagValues(words, flag) {
  return words.flatMap((word, index) => {
    if (word === flag) {
      return words[index + 1] === undefined ? [] : [words[index + 1]];
    }
    return word.startsWith(`${flag}=`) ? [word.slice(flag.length + 1)] : [];
  });
}

function keywordExpressions(words) {
  return words.flatMap((word, index) => {
    if (word === '-k') {
      return words[index + 1] === undefined ? [] : [words[index + 1]];
    }
    return word.startsWith('-k') && !word.startsWith('--') ? [word.slice(2)] : [];
  });
}

export function collectionOptions(config) {
  const [deselected, ignored, ignoredGlobs] = VALUE_FLAGS.map((flag) =>
    flagValues(config.addopts, flag),
  );
  return {
    pythonFiles: config.pythonFiles,
    pythonClasses: config.pythonClasses,
    pythonFunctions: config.pythonFunctions,
    norecursedirs: config.norecursedirs,
    testpaths: config.testpaths,
    deselected,
    ignored,
    ignoredGlobs,
    keywords: keywordExpressions(config.addopts),
  };
}
