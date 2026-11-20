import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-directory-passing-existence-check.mts';

const tester = typescriptRuleTester();
const FS = "import fs from 'node:fs';\n";

function flagged(code: string) {
  return { code: `${FS}${code}`, errors: [{ messageId: 'directory' as const }] };
}

tester.run('no-directory-passing-existence-check', rule, {
  valid: [
    'const st = fs.statSync(p, { throwIfNoEntry: false }); if (st?.isFile()) { fs.readFileSync(p, "utf8"); }',
    'if (fs.existsSync(options.file) && fs.statSync(options.file).isFile()) { fs.readFileSync(options.file, "utf8"); }',
    'if (fs.existsSync(options.file)) { fs.readdirSync(options.file); }',
    'if (fs.existsSync(options.file)) { fs.readFileSync(other, "utf8"); }',
    'if (fs.existsSync(options.file)) { try { fs.readFileSync(options.file, "utf8"); } catch (e) { handle(e); } }',
    'if (fs.existsSync(options.dir + "/package.json")) { fs.readFileSync(options.dir + "/package.json", "utf8"); }',
    `if (fs.existsSync(\`\${options.dir}/config.json\`)) { fs.readFileSync(\`\${options.dir}/config.json\`, "utf8"); }`,
    'if (fs.existsSync("/etc/app.conf")) { fs.readFileSync("/etc/app.conf", "utf8"); }',
    'function load(name) { if (fs.existsSync(name)) { return fs.readFileSync(name, "utf8"); } }',
    'const cache = path.join(dir, "cache"); if (fs.existsSync(cache)) { fs.readFileSync(cache); }',
    'if (!fs.existsSync(options.file)) { return; } fs.statSync(options.file).isFile();',
    'if (existsSync(options.file)) { log(readFileSync); }',
    'fs.existsSync(options.file);',
    'function f() { if (other.existsSync(options.file)) { fs.readFileSync(options.file); } }',
    'async function f() { await fsp.access(options.file, fs.constants.X_OK); return fsp.readFile(options.file); }',
    'const files = paths.filter((p) => fs.existsSync(p)).map((p) => p.length);',
    "const p = join(root, 'nx.json'); const text = existsSync(p) ? readFileSync(p, 'utf8') : '';",
    'const files = paths.filter((p) => isReadable(p)).map((p) => fs.readFileSync(p));',
  ],
  invalid: [
    flagged(
      'function load(filePath) { if (fs.existsSync(filePath)) { return fs.readFileSync(filePath, "utf8"); } }',
    ),
    flagged(
      'if (fs.existsSync(options.ignorePath)) { rules.add(fs.readFileSync(options.ignorePath, "utf8")); }',
    ),
    flagged(
      'if (existsSync(config.memoryFile)) { rules.add(readFileSync(config.memoryFile, "utf8")); }',
    ),
    flagged(
      'const text = fs.existsSync(settings.file) ? fs.readFileSync(settings.file, "utf8") : "";',
    ),
    flagged('const text = fs.existsSync(args.file) && fs.readFileSync(args.file, "utf8");'),
    flagged(
      'function f() { if (!fs.existsSync(options.file)) { return null; } return ' +
        'fs.readFileSync(options.file, "utf8"); }',
    ),
    flagged(
      'for (const file of files) { if (!existsSync(file)) { continue; } const text = readFileSync(file, "utf8"); }',
    ),
    flagged(
      'for (const file of files) { if (fs.existsSync(file)) { total += fs.readFileSync(file).length; } }',
    ),
    flagged(
      'files.forEach((file) => { if (fs.existsSync(file)) { read(fs.readFileSync(file)); } });',
    ),
    flagged(
      'async function f() { await fsp.access(options.fullPath); return fsp.readFile(options.fullPath, "utf8"); }',
    ),
    flagged(
      'async function f() { if (await pathExists(options.file)) { return fse.readJson(options.file); } }',
    ),
    flagged(
      'if (fs.existsSync(this.config.file)) { fs.createReadStream(this.config.file).pipe(out); }',
    ),
    flagged(
      'const files = paths.filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, "utf8"));',
    ),
    flagged('const files = paths.filter(existsSync).map((p) => readFileSync(p, "utf8"));'),
  ],
});
