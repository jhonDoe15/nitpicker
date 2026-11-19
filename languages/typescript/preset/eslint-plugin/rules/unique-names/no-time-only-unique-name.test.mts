import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-time-only-unique-name.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: 'directory' | 'file' | 'id') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-time-only-unique-name', rule, {
  valid: [
    'const dir = await fsp.mkdtemp(join(tmpdir(), "pwa-"));',
    `const dir = join(tmpdir(), \`pwa-\${randomUUID()}\`);`,
    `const dir = join(tmpdir(), \`pwa-\${Date.now()}-\${randomUUID()}\`);`,
    `const dir = join(tmpdir(), \`pwa-\${process.pid}-\${Date.now()}-\${counter++}\`);`,
    `const dir = join(tmpdir(), \`pwa-\${Date.now()}-\${Math.random().toString(36)}\`);`,
    `const dir = join(tmpdir(), \`pwa-\${userId}-\${Date.now()}\`);`,
    `const dir = join(base, \`pwa-\${Date.now()}\`);`,
    'const dir = join(tmpdir(), "pwa-fixed");',
    'const msg = { _id: message._id || randomUUID() };',
    'const msg = { _id: message._id || crypto.randomUUID(), text };',
    'const msg = { createdAt: Date.now() };',
    'const msg = { id: Date.now() };',
    'const now = Date.now(); const msg = { id: now - 1 };',
    `const msg = { label: \`at \${Date.now()}\` };`,
    `const msg = { id: \`\${prefix}-\${Date.now()}\` };`,
    'const started = Date.now(); const elapsed = Date.now() - started;',
    'writeFileSync("out.json", data);',
    `writeFileSync(\`out-\${requestId}.json\`, data);`,
    `writeFileSync(\`out-\${Date.now()}-\${requestId}.json\`, data);`,
    `log(\`finished at \${Date.now()}\`);`,
    `const key = \`\${tenant}:\${Date.now()}\`;`,
    'const name = file.name || randomUUID();',
    `const name = \`Report \${new Date().toISOString().slice(0, 10)}\`;`,
    `const msg = { key: \`day-\${new Date().toDateString()}\` };`,
    'const dir = os.tmpdir() + "/pwa-" + randomUUID();',
  ],
  invalid: [
    flagged(`const tempDir = join(tmpdir(), \`pwa-\${Date.now()}\`);`, 'directory'),
    flagged('const tempDir = path.join(os.tmpdir(), "pwa-" + Date.now());', 'directory'),
    flagged(`const tempDir = \`\${os.tmpdir()}/pwa-\${Date.now()}\`;`, 'directory'),
    flagged(
      `const tempDir = path.resolve(os.tmpdir(), \`run-\${new Date().toISOString()}\`);`,
      'directory',
    ),
    flagged('const msg = { _id: message._id || String(Date.now()), text };', 'id'),
    flagged('const msg = { id: String(Date.now()) };', 'id'),
    flagged('const dir = os.tmpdir() + "/pwa-" + Date.now();', 'directory'),
    flagged(`const id = \`evt-\${new Date().toISOString().slice(0, 10)}\`;`, 'id'),
    flagged(`const msg = { id: \`msg-\${Date.now()}\` };`, 'id'),
    flagged('const msg = { uid: Date.now().toString(36) };', 'id'),
    flagged('const msg = { key: "row-" + Date.now() };', 'id'),
    flagged(`const msg = { name: \`session-\${new Date().toISOString().slice(0, 16)}\` };`, 'id'),
    flagged('const id = message.id ?? Date.now();', 'id'),
    flagged('record.id = String(performance.now());', 'id'),
    flagged(`writeFileSync(\`out-\${Date.now()}.json\`, data);`, 'file'),
    flagged(
      `const target = \`session-\${new Date().toISOString().slice(0, 16)}.json\`; fs.writeFileSync(target, data);`,
      'file',
    ),
    flagged('fs.mkdirSync(join("runs", "run-" + Date.now()));', 'file'),
    flagged(`createWriteStream(\`log-\${new Date().getTime()}.txt\`);`, 'file'),
  ],
});
