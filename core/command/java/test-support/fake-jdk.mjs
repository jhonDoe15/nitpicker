import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FIRST_FINDING_LINE = 3;
const GOOGLE_CHECKS = [
  '<module name="Checker">',
  '<module name="TreeWalker">',
  '<module name="MethodName"><property name="format" value="^[a-z]+$"/></module>',
  '<module name="GoogleNonConstantFieldName"/>',
  '<module name="TodoComment"><property name="id" value="TodoFormat"/></module>',
  '</module>',
  '</module>',
].join('\n');

function lines(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

function sarif(name, results) {
  return JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name } }, results }] });
}

function put(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function readArgumentFile(argument) {
  return readFileSync(argument.slice(1), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((token) => token.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\'));
}

function pmd({ after, cwd }) {
  const source = path.join(cwd, 'src/main/java/demo/A.java');
  put(
    after('--report-file'),
    sarif(
      'PMD',
      lines(path.join(cwd, 'violations.txt')).map((text, index) => ({
        ruleId: 'UnusedPrivateField',
        message: { text },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: `file://${source}` },
              region: { startLine: index + FIRST_FINDING_LINE },
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
  'edu.umd.cs.findbugs.FindBugs2'({ after }) {
    put(after('-output'), sarif('SpotBugs', []));
  },
  'com.puppycrawl.tools.checkstyle.Main'({ after }) {
    put(after('-o'), '<checkstyle version="10.21.1"></checkstyle>');
  },
  'org.jacoco.cli.internal.Main'({ after, cwd }) {
    copyOrWrite(after('--xml'), path.join(cwd, 'jacoco.xml'), '<report name="demo"></report>');
  },
  'org.pitest.mutationtest.commandline.MutationCoverageReport'({ after, cwd }) {
    copyOrWrite(
      path.join(after('--reportDir'), 'mutations.xml'),
      path.join(cwd, 'mutations.xml'),
      '<mutations/>',
    );
  },
  'com.google.googlejavaformat.java.Main'() {},
  'de.thetaphi.forbiddenapis.cli.CliMain'() {},
};

function java({ args, cwd }) {
  const tokens = args[0]?.startsWith('@') ? readArgumentFile(args[0]) : args;
  function after(name) {
    return tokens[tokens.indexOf(name) + 1];
  }
  const mainClass = tokens.find((token) => /^[a-z][\w]*(?:\.[\w$]+)+$/u.test(token));
  const script = tokens.find((token) => token.endsWith('.java'));
  if (args[0] === '-version') {
    return { stderr: 'openjdk version "21.0.1" 2023-10-17\n' };
  }
  if (script?.endsWith('StructureMetrics.java')) {
    put(tokens[tokens.indexOf(script) + 1], '[]');
    put(tokens[tokens.indexOf(script) + 2], '{"files":{},"classes":[]}');
  } else if (script?.endsWith('ErrorProneReport.java')) {
    put(tokens[tokens.indexOf(script) + 1], '[]\n');
  } else if (script?.endsWith('CpdReport.java')) {
    copyOrWrite(tokens[tokens.indexOf(script) + 1], path.join(cwd, 'cpd.xml'), '<pmd-cpd/>');
  } else {
    const handler = HANDLERS[mainClass];
    if (handler === undefined) {
      throw new Error(`fake java does not know how to run: ${tokens.join(' ')}`);
    }
    handler({ after, cwd });
  }
  return {};
}

function jdeps({ args, cwd }) {
  const testClasses = args.some((argument) => argument.includes('test-classes'));
  const reports = ['jdeps.txt', 'jdeps/jdeps.txt', ...(testClasses ? ['jdeps/jdeps-test.txt'] : [])]
    .map((file) => path.join(cwd, file))
    .filter((file) => existsSync(file));
  return { stdout: reports.map((file) => readFileSync(file, 'utf8')).join('') };
}

function jar({ cwd }) {
  put(path.join(cwd, 'google_checks.xml'), GOOGLE_CHECKS);
  return {};
}

function javac({ args }) {
  return args[0] === '-version' ? { stdout: 'javac 21.0.1\n' } : {};
}

const TOOLS = { java, javac, jdeps, jar };

export const fakeJdkTools = Object.keys(TOOLS);

export function runFakeJdk({ tool, args, cwd }) {
  return { status: 0, stdout: '', stderr: '', ...TOOLS[tool]({ args, cwd }) };
}
