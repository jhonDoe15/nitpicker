import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [tool, ...rawArguments] = process.argv.slice(2);
const lines = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
const sarif = (name, results) =>
  JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name } }, results }] });
const GOOGLE_CHECKS = [
  '<module name="Checker">',
  ...['MemberName', 'MethodName'].map(
    (name) => `<module name="${name}"><property name="format" value="^[a-z]+$"/></module>`,
  ),
  '</module>',
].join('\n');
const put = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

function readArgumentFile(argument) {
  return readFileSync(argument.slice(1), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((token) => token.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\'));
}

const tokens = rawArguments[0]?.startsWith('@') ? readArgumentFile(rawArguments[0]) : rawArguments;
const after = (name) => tokens[tokens.indexOf(name) + 1];
const mainClass = tokens.find((token) => /^[a-z][\w]*(?:\.[\w$]+)+$/u.test(token));
const script = tokens.find((token) => token.endsWith('.java'));

function pmd() {
  const source = path.join(process.cwd(), 'src/main/java/demo/A.java');
  put(
    after('--report-file'),
    sarif(
      'PMD',
      lines('violations.txt').map((text, index) => ({
        ruleId: 'UnusedPrivateField',
        message: { text },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: `file://${source}` },
              region: { startLine: index + 3 },
            },
          },
        ],
      })),
    ),
  );
}

function copyOrWrite(target, source, fallback) {
  put(target, existsSync(source) ? readFileSync(source, 'utf8') : fallback);
}

const HANDLERS = {
  'net.sourceforge.pmd.cli.PmdCli': pmd,
  'edu.umd.cs.findbugs.FindBugs2': () => put(after('-output'), sarif('SpotBugs', [])),
  'com.puppycrawl.tools.checkstyle.Main': () =>
    put(after('-o'), '<checkstyle version="10.21.1"></checkstyle>'),
  'org.jacoco.cli.internal.Main': () =>
    copyOrWrite(after('--xml'), 'jacoco.xml', '<report name="demo"></report>'),
  'org.pitest.mutationtest.commandline.MutationCoverageReport': () =>
    copyOrWrite(path.join(after('--reportDir'), 'mutations.xml'), 'mutations.xml', '<mutations/>'),
  'com.google.googlejavaformat.java.Main': () => undefined,
};

function java() {
  if (rawArguments[0] === '-version') {
    process.stderr.write('openjdk version "21.0.1" 2023-10-17\n');
  } else if (script?.endsWith('StructureMetrics.java')) {
    put(tokens[tokens.indexOf(script) + 1], '[]');
    put(tokens[tokens.indexOf(script) + 2], '{"files":{},"classes":[]}');
  } else if (script?.endsWith('ErrorProneReport.java')) {
    put(tokens[tokens.indexOf(script) + 1], '[]\n');
  } else {
    HANDLERS[mainClass]();
  }
}

const TOOLS = {
  java,
  jdeps: () =>
    process.stdout.write(existsSync('jdeps.txt') ? readFileSync('jdeps.txt', 'utf8') : ''),
  jar: () => put('google_checks.xml', GOOGLE_CHECKS),
};

TOOLS[tool]();
