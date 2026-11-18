import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPinnedTools } from '../../../java-build.mjs';
import { javaCommand } from '../../../../maven/programs/java-command.mts';
import { effectsTool, resolveTools } from '../../../../maven/maven-tools.mjs';
import { PLAIN_TOOL, type HostedTool } from '../../config/host-config.mts';
import { hostedRun, type HostedRun } from '../../client/host-client.mts';
import { startToolHosts } from '../host-session.mts';

const COMPILE_TIMEOUT_MS = 120_000;
const RUN_TIMEOUT_MS = 60_000;
const ALLOWED: Readonly<Record<string, HostedTool>> = { 'probe.Probe': PLAIN_TOOL };
const PROBE = `package probe;

public final class Probe {
  private static int runs;

  public static void main(String[] args) throws Exception {
    runs++;
    switch (args[0]) {
      case "echo" -> {
        System.out.println("out " + runs);
        System.err.println("err " + runs);
      }
      case "exit" -> Helper.leave(Integer.parseInt(args[1]));
      case "runtime-exit" -> Runtime.getRuntime().exit(4);
      case "throw" -> throw new IllegalStateException("boom");
      case "sleep" -> Thread.sleep(Long.parseLong(args[1]));
      case "hook" -> Runtime.getRuntime().addShutdownHook(new Thread(() -> System.out.println("hook ran")));
      case "properties" -> System.out.println(System.getProperty("user.dir") + " " + System.getProperty("probe.flag"));
      case "jul" -> java.util.logging.Logger.getLogger("probe").warning("jul warning " + runs);
      case "thread-exit" -> {
        new Thread(() -> System.exit(7)).start();
        Thread.sleep(60000);
      }
      case "thread-halt" -> {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> System.out.println("hook ran")));
        Thread thread = new Thread(() -> Runtime.getRuntime().halt(9));
        thread.start();
        Thread.sleep(60000);
      }
      case "pool" -> java.util.concurrent.CompletableFuture.runAsync(() -> System.out.println(
          Thread.currentThread().getContextClassLoader() == Probe.class.getClassLoader()
              && Thread.currentThread().getContextClassLoader().getResource("probe/Probe.class") != null)).join();
      default -> throw new IllegalArgumentException(args[0]);
    }
  }

  private static final class Helper {
    static void leave(int code) {
      try {
        System.exit(code);
      } finally {
        System.out.println("finally ran");
      }
    }
  }
}
`;

export type ProbeHost = {
  readonly work: string;
  readonly classes: string;
  readonly run: (
    args: readonly string[],
    timeout?: number,
    jvmArgs?: readonly string[],
  ) => ReturnType<typeof hostedRun>;
  readonly stopHosts: () => void;
  readonly dispose: () => void;
  readonly temporary: (prefix: string) => string;
};

export function startProbeHost(maven: string | undefined): ProbeHost {
  const roots: string[] = [];
  function temporary(prefix: string): string {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    return root;
  }
  const work = temporary('nitpicker-host-work-');
  const sources = temporary('nitpicker-probe-src-');
  const classes = temporary('nitpicker-probe-classes-');
  mkdirSync(path.join(sources, 'probe'));
  writeFileSync(path.join(sources, 'probe/Probe.java'), PROBE);
  const compiled = spawnSync(
    javaCommand('javac'),
    ['-d', classes, path.join(sources, 'probe/Probe.java')],
    { encoding: 'utf8', timeout: COMPILE_TIMEOUT_MS },
  );
  if (compiled.status !== 0) {
    throw new Error(compiled.stderr);
  }
  const pinned: unknown = readPinnedTools();
  const tools: unknown = resolveTools({
    projectRoot: work,
    maven,
    pinned,
    quick: true,
    launcherVersions: [],
    extraTools: effectsTool(pinned),
    spawn: undefined,
    timeoutMs: undefined,
  });
  let warning = '';
  const warn = {
    write: (text: string) => {
      warning = text;
    },
  };
  const hosts = startToolHosts({ work, modules: 2, tools, pinned, warn });
  if (hosts === undefined) {
    throw new Error(`The tool hosts did not start: ${warning}`);
  }
  function spec(args: readonly string[], jvmArgs: readonly string[]): HostedRun {
    return {
      java: javaCommand('java'),
      jvmArgs,
      classpath: [classes],
      mainClass: 'probe.Probe',
      args,
      cwd: work,
    };
  }
  return {
    work,
    classes,
    temporary,
    run: (args, timeout = RUN_TIMEOUT_MS, jvmArgs = []) =>
      hostedRun(spec(args, jvmArgs), timeout, ALLOWED),
    stopHosts() {
      hosts.stop();
    },
    dispose() {
      hosts.stop();
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
