const TEST_DIRECTORIES = new Set(['tests', 'test']);
const ALSO_TESTS = ['test_*.py', '*_test.py', 'tests.py', 'tests_*.py', '*_tests.py'];
const VALUE_FLAGS = ['--deselect', '--ignore', '--ignore-glob'];

export function matchesGlob(name, pattern) {
  let nameIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let resume = 0;
  while (nameIndex < name.length) {
    const token = pattern[patternIndex];
    if (token === '*') {
      starIndex = patternIndex;
      resume = nameIndex;
      patternIndex += 1;
    } else if (token === '?' || token === name[nameIndex]) {
      patternIndex += 1;
      nameIndex += 1;
    } else if (starIndex >= 0) {
      resume += 1;
      nameIndex = resume;
      patternIndex = starIndex + 1;
    } else {
      return false;
    }
  }
  return pattern.slice(patternIndex).split('*').join('') === '';
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
