import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unstripped-remote-text.mts';

const tester = typescriptRuleTester();
const HEAD = 'import { stripVTControlCharacters } from "node:util";\n';

function flagged(code: string, count = 1) {
  return {
    code: HEAD + code,
    errors: Array.from({ length: count }, () => ({ messageId: 'stripControls' })),
  };
}

function allowed(code: string) {
  return { code: HEAD + code };
}

tester.run('no-unstripped-remote-text', rule, {
  valid: [
    allowed('const res = await fetch(u); const body = await res.json(); console.log(body);'),
    allowed('socket.on("message", (data) => console.log(data));'),
    allowed('socket.on("message", (data) => this.logger.debug(`got ${data.text}`));'),
    allowed('const res = await fetch(u); console.log(`${res.status} ${res.statusText}`);'),
    allowed(
      'socket.on("console", (payload) => logger.info(stripVTControlCharacters(payload.text)));',
    ),
    allowed(
      'const res = await fetch(u); const body = await res.json(); console.log(`Deployed: ' +
        '${stripVTControlCharacters(body.name)}`);',
    ),
    allowed(
      'const res = await fetch(u); const body = await res.text(); console.log(JSON.stringify(body));',
    ),
    allowed('const res = await fetch(u); console.log(res.status);'),
    allowed('const res = await axios.get(u); console.log(res.status, res.headers);'),
    allowed('socket.on("close", (code) => console.log(code));'),
    allowed('socket.on("error", (error) => console.error(error));'),
    allowed('emitter.on("message", (m) => console.log(m));'),
    allowed('const body = await res.json(); console.log(body.name);'),
    allowed('const config = await load(); console.log(config.name);'),
    {
      code: 'const res = await fetch(u); const body = await res.json(); console.log(body.name);',
    },
    {
      code:
        'import { x } from "node:fs"; const res = await fetch(u); const t = await res.text(); document.title = ' +
        't; console.log(t);',
    },
  ],
  invalid: [
    flagged('socket.on("console", (payload) => logger.info(payload.text));'),
    flagged('ws.on("message", (data) => console.log(data.toString()));'),
    flagged(
      'const res = await fetch(u); const body = await res.json(); console.log(`Deployed: ${body.name}`);',
    ),
    flagged('const res = await axios.post(u, x); console.log("Deployed: " + res.data.name);'),
    flagged('const { data } = await axios.get(u); process.stdout.write(data.message);'),
    flagged('const res = await fetch(u); process.stderr.write(await res.text());'),
    flagged(
      'const res = await fetch(u); const text = await res.text(); console.error(text, text);',
      2,
    ),
    flagged('import.meta.hot.on("vite:console", ({ text }) => console.log(text));'),
  ],
});
