import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-case-sensitive-path-compare.mts';

const tester = typescriptRuleTester();

function path(code: string) {
  return { code, errors: [{ messageId: 'path' as const }] };
}

function authority(code: string) {
  return { code, errors: [{ messageId: 'authority' as const }] };
}

tester.run('no-case-sensitive-path-compare', rule, {
  valid: [
    'if (path.relative(a, b) === "") {}',
    'if (msg.workspaceRoot === "") {}',
    'if (workspaceRoot === undefined) {}',
    'if (norm(msg.workspaceRoot) !== norm(receiverWorkspaceRoot)) {}',
    'if (msg.workspaceRoot.toLowerCase() !== receiverWorkspaceRoot.toLowerCase()) {}',
    'if (path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()) {}',
    'if (a.path === b.path) {}',
    'if (path.resolve(a) === path.resolve(b)) {}',
    'if (parentDir === currentDir) {}',
    'if (process.cwd() === configDir) {}',
    'if (this.ensuredDir !== dir) {}',
    'if (path.dirname(file) === path.dirname(other)) {}',
    'if (route.path === location.pathname) {}',
    'if (userPath === otherPath) {}',
    'if (isSamePath(msg.workspaceRoot, receiverWorkspaceRoot)) {}',
    'if (isEqualAuthority(connection.remoteAuthority, uri.authority)) {}',
    'if (uri.authority.toLowerCase() === other.authority.toLowerCase()) {}',
    'if (url.host === "localhost") {}',
    'if (a.hostname === b.path) {}',
    'if (name === dir) {}',
    'function same(a, b) { if (process.platform === "linux") { return a.workspaceRoot === b.workspaceRoot; } }',
    'if (file.startsWith(prefix)) {}',
    'if (filePath.startsWith(rootDir + path.sep)) {}',
    'if (dir.startsWith("src")) {}',
    'if (name.includes(other)) {}',
    'export const a = (o: { rankDir: string }, rankDir: string) => o.rankDir !== rankDir;',
    'if (appsDir != libsDir) {}',
    'if (u.hostname === v.hostname) {}',
    'if (new URL(x).host === other.host) {}',
    'if (step.result.host !== expected.host) {}',
    'if (c.host === GITHUB_HOST) {}',
    'if (paths.targetRoot !== paths.targetDir) {}',
    'if (workspace.cwd === project.cwd) {}',
    'if (a.root.dir === b.root.dir) {}',
    'if (cwd === OTHER_ROOT) {}',
  ],
  invalid: [
    path('if (msg.workspaceRoot !== receiverWorkspaceRoot) { return true; }'),
    path('if (path.join(root, "x") === file.fsPath) {}'),
    path('if (editor.document.uri.fsPath === resource.fsPath) {}'),
    path('if (cwd === other.projectPath) {}'),
    path('if (path.resolve(a) === other.workspaceRoot) {}'),
    path('if (filePath.startsWith(options.workspaceRoot + path.sep)) {}'),
    path('if (filePath.startsWith(config.rootDir)) {}'),
    path('if (outDir === options.rootDir) {}'),
    path('if (outDirectory.endsWith(build.dir)) {}'),
    path('if (`${a.workspaceRoot}/x` === b.projectRoot) {}'),
    authority('if (connection?.remoteAuthority === uri.authority) {}'),
    authority('if (a.authority !== b.authority) {}'),
    authority('if (requestUrl.host === remoteAuthority) {}'),
    authority('if (uri.authority === remoteAuthority) {}'),
  ],
});
