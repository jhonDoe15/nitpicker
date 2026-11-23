import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-shared-temp-path-in-tests.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: 'fixed' | 'processOnly') {
  return { code, errors: [{ messageId }] };
}

const written = (path: string) => `const out = ${path}; writeFileSync(out, data);`;

tester.run('no-shared-temp-path-in-tests', rule, {
  valid: [
    'const dir = await mkdtemp(join(tmpdir(), "report-"));',
    'const dir = mkdtempSync(path.join(os.tmpdir(), "report-"));',
    'const dir = await fs.promises.mkdtemp(`${tmpdir()}/report-`);',
    'const prefix = join(tmpdir(), "report-"); const dir = await mkdtemp(prefix);',
    'const dir = mkdtempSync("/tmp/repo-");',
    written('join(tmpdir(), `report-${randomUUID()}.json`)'),
    written('join(tmpdir(), `report-${process.pid}-${runs++}.json`)'),
    written('join(tmpdir(), `report-${process.pid}-${randomBytes(4).toString("hex")}.json`)'),
    written('join(await mkdtemp(join(tmpdir(), "r-")), "report.json")'),
    'const dir = await mkdtemp(join(tmpdir(), "r-")); writeFileSync(join(dir, "report.json"), data);',
    'function out(dir) { return join(dir, "report.json"); } writeFileSync(out(root), data);',
    'function out(name) { return join(tmpdir(), name); } writeFileSync(out("a"), data);',
    written('join(root, "report.json")'),
    written('join(tmpdir(), testInfo.title)'),
    'const base = join(tmpdir(), "suite"); writeFileSync(join(base, randomUUID()), data);',
    'const missing = join(tmpdir(), "no-such-project"); expect(detect(missing)).toEqual([]);',
    'expect(() => readReport(join(tmpdir(), "missing-report"))).toThrow();',
    'const file = join(tmpdir(), "pick.ts"); expect(scriptFile(pathToFileURL(file).href)).toBe(file);',
    'expect(normalize("/tmp/a/b")).toBe("/tmp/a/b");',
    'writeFileSync("report.json", data);',
    'writeFileSync(target, `${tmpdir()}/report.json`);',
    'writeFileSync(target, JSON.stringify({ out: join(tmpdir(), "report.json") }));',
    'const message = `${count} files`;',
    'type Root = "/tmp/a";',
    'copyFileSync(join(tmpdir(), "src.json"), dest);',
    'cpSync(join(tmpdir(), "src"), dest, { recursive: true });',
  ],
  invalid: [
    flagged(written('join(tmpdir(), "report.json")'), 'fixed'),
    flagged(written('path.join(os.tmpdir(), "nitpicker", "report.json")'), 'fixed'),
    flagged(written('`${os.tmpdir()}/report.json`'), 'fixed'),
    flagged(written('os.tmpdir() + "/report.json"'), 'fixed'),
    flagged(written('join(tmpdir(), "report.json") as string'), 'fixed'),
    flagged('writeFileSync("/tmp/report.json", data);', 'fixed'),
    flagged('const OUT = "/tmp/report.json"; await writeFile(OUT, data);', 'fixed'),
    flagged('afterEach(() => rmSync(join(tmpdir(), "suite"), { recursive: true }));', 'fixed'),
    flagged('await fs.promises.rename(source, join(tmpdir(), "report.json"));', 'fixed'),
    flagged('copyFileSync(source, join(tmpdir(), "report.json"));', 'fixed'),
    flagged('renameSync(join(tmpdir(), "report.json"), target);', 'fixed'),
    flagged(written('join(tmpdir(), `report-${process.pid}.json`)'), 'processOnly'),
    flagged(written('join(tmpdir(), `report-${String(process.pid)}.json`)'), 'processOnly'),
    flagged(written('join(tmpdir(), "report-" + process.pid.toString() + ".json")'), 'processOnly'),
    flagged('mkdirSync(`/tmp/repo-${process.pid}`, { recursive: true });', 'processOnly'),
    flagged(
      'const SUITE = "parity"; mkdirSync(join(tmpdir(), `${SUITE}-${process.pid}`));',
      'processOnly',
    ),
    flagged(
      [
        'function reportFor(name) { return join(tmpdir(), `engine-${name}-${process.pid}.json`); }',
        'it("reports", () => { execFileSync(engine, ["--report", reportFor("case")]); });',
      ].join('\n'),
      'processOnly',
    ),
    flagged(
      [
        'const reportFor = (name) => join(tmpdir(), `engine-${name}-${process.pid}.json`);',
        'it("reports", () => { const args = ["--report", reportFor("a")]; spawnSync(engine, args); });',
      ].join('\n'),
      'processOnly',
    ),
    flagged(
      'const dir = join(tmpdir(), "fixture"); execFileSync("git", ["init"], { cwd: dir });',
      'fixed',
    ),
    {
      code: 'const base = join(tmpdir(), "suite"); writeFileSync(join(base, "report.json"), data);',
      errors: [{ messageId: 'fixed', line: 1, column: 53 }],
    },
    {
      code: 'const base = join(tmpdir(), "s"); writeFileSync(join(base, "r.json"), data); rmSync(base);',
      errors: [{ messageId: 'fixed' }, { messageId: 'fixed' }],
    },
  ],
});
