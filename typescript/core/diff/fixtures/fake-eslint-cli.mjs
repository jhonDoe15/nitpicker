import path from 'node:path';

const mode = process.env.QUALITY_DIFF_FAKE_ESLINT_MODE;

if (mode === 'malformed') {
  process.stdout.write('{not-json');
  process.exitCode = 1;
} else if (mode === 'configuration-error') {
  process.stderr.write('ESLint configuration could not be loaded\n');
  process.exitCode = 2;
} else if (mode === 'crash') {
  throw new Error('ESLint fixture crashed');
} else if (mode === 'timeout') {
  setInterval(() => {}, 60_000);
} else {
  process.stdout.write(
    `${JSON.stringify([
      {
        filePath: path.join(process.cwd(), 'src/main/source.ts'),
        messages: [
          {
            ruleId: 'fixture-rule',
            severity: 2,
            message: 'Fixture finding',
            messageId: 'fixtureFinding',
            line: 1,
            column: 1,
            nodeType: 'Program',
          },
        ],
        errorCount: 1,
        warningCount: 0,
      },
    ])}\n`,
  );
  process.exitCode = 1;
}
