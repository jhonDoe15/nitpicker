import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const GRADLE_DIRECTORY = 'languages/java/gradle';
const FRAGMENTS = `${GRADLE_DIRECTORY}/rulesets`;
const HEAD = 'ruleset.xml';

function byCodePoint(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function ruleFiles(directory) {
  const files = [];
  const pending = [directory];
  for (const folder of pending) {
    const items = readdirSync(folder, { withFileTypes: true });
    pending.push(
      ...items.filter((item) => item.isDirectory()).map((item) => path.join(folder, item.name)),
    );
    const rules = items.filter((item) => item.isFile() && item.name.endsWith('.xml'));
    files.push(...rules.map((item) => path.join(folder, item.name)));
  }
  const head = path.join(directory, HEAD);
  return files
    .filter((file) => file !== head)
    .map((file) => path.relative(directory, file).split(path.sep).join('/'))
    .toSorted(byCodePoint);
}

const RULE_ELEMENT = /<rule\s+name="([^"]+)"/gu;
const OUTSIDE_RULE = /^\s*<rule\b[\s\S]*<\/rule>\s*$/u;

function readRuleFile(directory, file) {
  const full = path.resolve(directory, file);
  if (!full.startsWith(directory + path.sep)) {
    throw new Error(`The rule file ${file} is outside ${directory}`);
  }
  const text = readFileSync(full, 'utf8');
  const names = [...text.matchAll(RULE_ELEMENT)].map((match) => match[1]);
  const expected = path.posix.basename(file, '.xml');
  if (names.length !== 1 || names[0] !== expected || !OUTSIDE_RULE.test(text)) {
    throw new Error(`${directory}/${file} must hold exactly one <rule name="${expected}">`);
  }
  return text;
}

function rulesetText(directory, name) {
  const headFile = path.join(directory, HEAD);
  if (!existsSync(headFile)) {
    throw new Error(`${directory} has no ${HEAD} with the ruleset's head`);
  }
  const head = readFileSync(headFile, 'utf8');
  const rules = ruleFiles(directory).map((file) => readRuleFile(directory, file));
  const note = `  <!-- Built by npm run gen:rules from ${FRAGMENTS}/${name}/: edit the rule files there. -->\n`;
  return `${head}${rules.join('')}${note}</ruleset>\n`;
}

/**
 * The PMD rulesets of the Java and Kotlin presets, by path relative to the repository root, each
 * built from its folder under `rulesets/`: `ruleset.xml` holds the head (the category references
 * and their settings), and every other XML file under the folder holds one rule, in path order.
 */
export function pmdRulesetSources(repositoryRoot) {
  const base = path.join(repositoryRoot, FRAGMENTS);
  return new Map(
    readdirSync(base, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .toSorted(byCodePoint)
      .map((name) => [`${GRADLE_DIRECTORY}/${name}.xml`, rulesetText(path.join(base, name), name)]),
  );
}
