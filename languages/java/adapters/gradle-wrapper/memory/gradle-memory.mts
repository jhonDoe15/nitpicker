import { availableParallelism } from 'node:os';
import { gradlePropertiesTexts } from '../gradle-command.mjs';
import { machineMemory, toolSlots, withToolHeap } from '../../../maven/parallel/tool-slots.mts';
import { textsOf } from '../../../../../shared/values/readers.mts';

type Environment = Readonly<Record<string, string | undefined>>;
type Machine = { readonly slots?: number; readonly cpus?: number };

const GIB = 1024 ** 3;
const WORKERS_MAX = /^\s*org\.gradle\.workers\.max\s*[=:]\s*(\d+)\s*$/mu;
const MEMORY_LOST =
  /Gradle build daemon disappeared unexpectedly|java\.lang\.OutOfMemoryError|GC overhead limit exceeded/u;

function projectWorkers(projectRoot: string, environment: Environment): number | undefined {
  const texts = textsOf(gradlePropertiesTexts(projectRoot, environment));
  const values = texts.flatMap((text) => {
    const value = WORKERS_MAX.exec(text)?.[1];
    return value === undefined ? [] : [Number(value)];
  });
  return values.length === 0 ? undefined : Math.min(...values);
}

export function gradleWorkerArguments(
  projectRoot: string,
  { slots = toolSlots(), cpus = availableParallelism() }: Machine = {},
  environment: Environment = process.env,
): string[] {
  const workers = Math.min(slots, projectWorkers(projectRoot, environment) ?? slots);
  return workers < cpus ? [`--max-workers=${String(workers)}`] : [];
}

export function gradleToolEnvironment(
  environment: Environment = process.env,
  slots = toolSlots(),
): Record<string, string | undefined> {
  const own = (environment['JDK_JAVA_OPTIONS'] ?? '').split(/\s+/u).filter((flag) => flag !== '');
  return { ...environment, JDK_JAVA_OPTIONS: withToolHeap(own, slots).join(' ') };
}

export function memoryAdvice(
  output: string,
  slots = toolSlots(),
  memory = machineMemory(),
): string {
  if (!MEMORY_LOST.test(output)) {
    return '';
  }
  const gib = (memory / GIB).toFixed(1);
  return (
    `\nThe Gradle daemon or one of its JVMs ran out of memory on a machine with ${gib} GB, where nitpicker ` +
    `runs ${String(slots)} tool JVM${slots === 1 ? '' : 's'} at once next to the daemon: lower the daemon heap ` +
    '(-Xmx in org.gradle.jvmargs) or org.gradle.workers.max in gradle.properties, or run on a larger machine.'
  );
}
