import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../../../core/cli.mjs';

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function command(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: gitEnvironment });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

export function git(root, ...args) {
  command(root, 'git', args);
}

export function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

export function commitBranch(root, name, files) {
  git(root, 'checkout', '-q', '-b', name, 'main');
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function gate(root, branch, extra = []) {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
  const output = { text: '' };
  const exitCode = runCli({
    arguments_: ['--base', 'main', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: {
      write: (value) => {
        output.text += value;
      },
    },
    stderr: {
      write: (value) => {
        output.text += value;
      },
    },
    progress: { write: () => undefined },
  });
  function json(name) {
    return JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  }
  return { exitCode, json, text: output.text, reports };
}

export function enforceable(result) {
  return summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );
}

export function withoutMutants(summaries) {
  return summaries.filter((summary) => !summary.startsWith('mutmut '));
}

export function summarize(findings) {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

const roots = [];

export function repository() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-')));
  roots.push(root);
  return root;
}

export function removeRepositories() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export const ORDER_TOTAL = [
  'def order_total(lines: list[tuple[int, int]], discount: int) -> int:',
  '    total = 0',
  '    for line in lines:',
  '        if line[0] > 0 and line[1] > 0:',
  '            total += line[0] * line[1]',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');
export const LAYERED_FILES = {
  'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
  '.gitignore': '.venv/\n__pycache__/\n',
  '.importlinter':
    '[importlinter]\nroot_package = shop\n\n[importlinter:contract:pure]\nname = Domain is pure\ntype = forbidden\nsource_modules = shop.domain\nforbidden_modules =\n    shop.web\n    shop.infra\n',
  'src/shop/__init__.py': '',
  'src/shop/domain/__init__.py': '',
  'src/shop/domain/pricing.py': `def price_with_tax(amount: float, rate: float) -> float:\n    return round(amount * (1 + rate), 2)\n\n\n${ORDER_TOTAL}`,
  'src/shop/infra/__init__.py': '',
  'src/shop/infra/store.py':
    'from shop.domain import pricing\n\n\ndef total(amounts: list[float]) -> float:\n    return sum(pricing.price_with_tax(amount, 0.1) for amount in amounts)\n',
  'src/shop/web/__init__.py': '',
  'src/shop/web/views.py':
    'from shop.domain import pricing\nfrom shop.infra import store\n\n\ndef show(amounts: list[float]) -> str:\n    return f"{store.total(amounts)} {pricing.price_with_tax(1, 0)}"\n',
  'tests/test_shop.py':
    'from shop.domain import pricing\nfrom shop.web import views\n\n\ndef test_show():\n    assert views.show([10]) == "11.0 1"\n\n\ndef test_total():\n    assert pricing.order_total([(2, 3), (2, 3)], 0) == 12\n',
};
