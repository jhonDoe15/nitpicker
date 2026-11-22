import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorProneChecks } from './checks/checks-docs.mts';

const CHECKS = errorProneChecks();

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const RUNNER_DIRECTORY = new URL('../../gradle/errorprone/', import.meta.url);
const REPORT_SOURCE = fileURLToPath(new URL('ErrorProneReport.java', RUNNER_DIRECTORY));
const CHECKS_FILE = fileURLToPath(new URL('checks.json', RUNNER_DIRECTORY));
const JAVA_TIMEOUT_MS = 120_000;
const IMMUTABLE_CLASS = 'com/google/errorprone/annotations/Immutable.class';
const PROBE = `import com.sun.source.util.JavacTask;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

public final class Probe {
  public static void main(String[] args) throws Exception {
    List<String> rest = List.of(args).subList(1, args.length);
    switch (args[0]) {
      case "flags" -> System.out.print(ErrorProneReport.pluginArgument(Files.readString(Path.of(rest.get(0))),
          List.of(), true, false, List.of(), Boolean.parseBoolean(rest.get(1))));
      case "generated" -> {
        List<String> input = Files.readAllLines(Path.of(rest.get(0)));
        List<String> declared =
            input.subList(2, input.size()).stream().map(flag -> "--errorprone-flag=" + flag).toList();
        List<String> lines = ErrorProneReport.withoutGenerated(
            List.of("--skip-generated", "--generated-root=" + input.get(0)), declared);
        String prefix = "--errorprone-flag=-XepExcludedPaths:";
        String pattern = lines.stream().filter(line -> line.startsWith(prefix)).findFirst().orElse(prefix)
            .substring(prefix.length());
        String path = new java.net.URI("file", null, input.get(1), null).getPath();
        boolean matches = java.util.regex.Pattern.compile(pattern).matcher(path).matches();
        System.out.print(String.join(" ", lines) + "\\n" + matches);
      }
      case "slices" -> ErrorProneReport.slices(rest).forEach(slice -> System.out.println(slice.size()));
      case "options" -> System.out.print(ErrorProneReport.javacOptions(rest));
      case "modular" -> System.out.print(ErrorProneReport.javacOptions(rest, List.of("src/module-info.java")));
      case "record" -> record(rest);
      case "isolate" -> isolate(rest);
      case "jobs" -> jobs(rest);
      case "parallel-ap" -> parallelAp(rest);
      default -> System.out.print(
          ErrorProneReport.immutableInReach(List.of("-classpath", rest.get(0)), rest.subList(1, rest.size())));
    }
  }

  static void isolate(List<String> rest) throws Exception {
    List<Path> created;
    List<String> isolated;
    try (ErrorProneReport.SliceOutput output = ErrorProneReport.isolateSliceOutputs(rest)) {
      isolated = output.options();
      created = output.temporaryDirectories();
      for (Path dir : created) {
        Files.writeString(dir.resolve("marker.txt"), "x");
      }
      System.out.println(String.join("|", isolated));
      System.out.println(created.stream().allMatch(Files::isDirectory));
    }
    System.out.print(created.stream().noneMatch(Files::exists));
  }

  static void jobs(List<String> rest) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    String checks = Files.readString(Path.of(rest.get(0)));
    List<ErrorProneReport.Job> list = ErrorProneReport.jobs(compiler, Path.of(rest.get(1)), checks);
    for (ErrorProneReport.Job job : list) {
      int cp = job.options().indexOf("-classpath");
      if (cp < 0) {
        cp = job.options().indexOf("-cp");
      }
      String classpath = cp >= 0 ? job.options().get(cp + 1) : "";
      System.out.println(job.sliced() + "|" + job.sources().size() + "|" + classpath);
    }
  }

  static void parallelAp(List<String> rest) throws Exception {
    Path procClasses = Path.of(rest.get(0));
    Path ownClasses = Path.of(rest.get(1));
    Path sharedD = Path.of(rest.get(2));
    Path sharedS = Path.of(rest.get(3));
    List<String> slice1 = List.of(rest.get(4));
    List<String> slice2 = List.of(rest.get(5));
    List<String> baseOptions = List.of(
        "-d", sharedD.toString(), "-s", sharedS.toString(),
        "-classpath", ownClasses.toString(),
        "-processorpath", procClasses.toString(),
        "-processor", "IndexProcessor");
    java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
    java.util.concurrent.CyclicBarrier barrier = new java.util.concurrent.CyclicBarrier(2);
    List<Path> allTemps = java.util.Collections.synchronizedList(new ArrayList<>());
    try {
      java.util.concurrent.Callable<Boolean> run1 = () -> compileSlice(baseOptions, slice1, barrier, allTemps);
      java.util.concurrent.Callable<Boolean> run2 = () -> compileSlice(baseOptions, slice2, barrier, allTemps);
      java.util.concurrent.Future<Boolean> f1 = pool.submit(run1);
      java.util.concurrent.Future<Boolean> f2 = pool.submit(run2);
      System.out.print(f1.get() + " " + f2.get() + " " + allTemps.stream().noneMatch(Files::exists));
    } finally {
      pool.shutdownNow();
    }
  }

  static boolean compileSlice(
      List<String> baseOptions, List<String> files,
      java.util.concurrent.CyclicBarrier barrier, List<Path> allTemps) throws Exception {
    barrier.await();
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    try (ErrorProneReport.SliceOutput output = ErrorProneReport.isolateSliceOutputs(baseOptions);
        StandardJavaFileManager manager = compiler.getStandardFileManager(null, null, null)) {
      allTemps.addAll(output.temporaryDirectories());
      return Boolean.TRUE.equals(compiler.getTask(
          null, manager, null, output.options(), null, manager.getJavaFileObjectsFromStrings(files)).call());
    }
  }

  static void record(List<String> rest) throws Exception {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    try (StandardJavaFileManager files = compiler.getStandardFileManager(null, null, null)) {
      List<String> options = List.of("-classpath", rest.get(0), "-d", rest.get(1));
      JavacTask task = (JavacTask) compiler.getTask(
          null, files, null, options, null, files.getJavaFileObjectsFromStrings(rest.subList(2, rest.size())));
      Map<String, List<ErrorProneReport.ClassSpan>> classes = new TreeMap<>();
      ErrorProneReport.recordClasses(task, classes);
      System.out.print(task.call() + " " + classes.keySet());
    }
  }
}
`;

describe.runIf(enabled)(
  'ErrorProneReport flags from checks.json, as Gradle and Maven run it',
  () => {
    let work: string;
    let compiled: SpawnSyncReturns<string>;

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), 'nitpicker-error-prone-report-'));
      writeFileSync(path.join(work, 'Probe.java'), PROBE);
      compiled = spawnSync('javac', ['-d', work, REPORT_SOURCE, path.join(work, 'Probe.java')], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
    });

    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
    });

    function probe(args: readonly string[], flags: readonly string[] = []): string {
      const run = spawnSync(
        'java',
        ['-Dstdout.encoding=UTF-8', ...flags, '-cp', work, 'Probe', ...args],
        {
          encoding: 'utf8',
          timeout: JAVA_TIMEOUT_MS,
        },
      );
      expect(run.status, run.stderr).toBe(0);
      return run.stdout;
    }

    function sources(count: number, text = 'class A {}'): string[] {
      const directory = mkdtempSync(path.join(work, 'sources-'));
      return Array.from({ length: count }, (_, index) => {
        const file = path.join(directory, `A${String(index)}.java`);
        writeFileSync(file, text);
        return file;
      });
    }

    it('turns on the enable list and off the disable list, and leaves the defaultOff checks to Error Prone', () => {
      const flags = probe(['flags', CHECKS_FILE, 'true']);

      expect(compiled.status, compiled.stderr).toBe(0);
      expect(flags).toBe(
        [
          '-Xplugin:ErrorProne',
          '-XepAllErrorsAsWarnings',
          '-XepCompilingTestOnlyCode',
          ...CHECKS.enable.map((check) => `-Xep:${check}:WARN`),
          ...CHECKS.disable.map((check) => `-Xep:${check}:OFF`),
          '-Xep:NullAway:OFF',
        ].join(' '),
      );
      expect(CHECKS.defaultOff.length).toBeGreaterThan(0);
    });

    it('turns the Immutable check off when its annotation is out of reach, before the project flags', () => {
      const flags = probe(['flags', CHECKS_FILE, 'false']).split(' ');

      expect(flags.slice(0, 3)).toEqual([
        '-Xplugin:ErrorProne',
        '-XepAllErrorsAsWarnings',
        '-Xep:Immutable:OFF',
      ]);
    });

    it('finds the Immutable annotation on the classpath or named in the sources', () => {
      const classes = mkdtempSync(path.join(work, 'classes-'));
      const [plain = '', annotated = ''] = [
        ...sources(1),
        ...sources(1, '@Immutable final class A {}'),
      ];

      expect(probe(['reach', classes, plain])).toBe('false');
      expect(probe(['reach', classes, annotated])).toBe('true');
      mkdirSync(path.dirname(path.join(classes, IMMUTABLE_CLASS)), { recursive: true });
      writeFileSync(path.join(classes, IMMUTABLE_CLASS), '');
      expect(probe(['reach', classes, plain])).toBe('true');
    });

    describe('leaving generated roots out', () => {
      const root = '/work/my app ü [1]/build/generated';

      function generated(file: string, declared: readonly string[] = []): string[] {
        const input = path.join(mkdtempSync(path.join(work, 'generated-')), 'input.txt');
        writeFileSync(input, [root, file, ...declared].join('\n'), 'utf8');
        return probe(['generated', input]).split('\n');
      }

      it('excludes the files under a root whose name has spaces, a non-ASCII letter and a bracket', () => {
        const [flags = '', matches] = generated(`${root}/proto/Api.java`);

        expect(matches).toBe('true');
        expect(flags.split(' ')).toEqual([
          '--errorprone-flag=-XepExcludedPaths:.*(?:/work/my\\x{20}app\\x{20}ü\\x{20}\\[1\\]/build/generated)/.*',
        ]);
      });

      it('leaves hand-written files and look-alike directories alone', () => {
        expect(generated('/work/my app ü [1]/src/main/java/Hand.java')[1]).toBe('false');
        expect(generated('/work/my app ü [1]/build/generatedX/Hand.java')[1]).toBe('false');
        expect(generated('/work/my-app ü [1]/build/generated/Api.java')[1]).toBe('false');
      });

      it('joins the pattern the project declared', () => {
        const [flags = '', matches] = generated('/work/legacy/Old.java', [
          '-XepExcludedPaths:.*/legacy/.*',
        ]);

        expect(matches).toBe('true');
        expect(flags.match(/-XepExcludedPaths:/gu)).toHaveLength(1);
      });
    });

    it('splits the sources into one slice per worker, keeping 40 files or more in each', () => {
      const files = sources(100);
      const sizes = (workers: number): number[] =>
        probe(['slices', ...files], [`-Dnitpicker.errorprone.workers=${String(workers)}`])
          .trim()
          .split('\n')
          .map(Number);

      expect(sizes(1)).toEqual([100]);
      expect(sizes(2)).toEqual([50, 50]);
      expect(sizes(8)).toEqual([50, 50]);
    });

    it('keeps a module compile in one slice', () => {
      const files = sources(100);
      const descriptor = path.join(path.dirname(files[0] ?? ''), 'module-info.java');
      writeFileSync(descriptor, 'module shop {}');

      expect(
        probe(['slices', descriptor, ...files], ['-Dnitpicker.errorprone.workers=4']).trim(),
      ).toBe('101');
    });

    it('records only project sources when javac compiles a source from a dependency jar', () => {
      const library = mkdtempSync(path.join(work, 'library-'));
      writeFileSync(
        path.join(library, 'Lib.java'),
        'public class Lib { public static int one() { return 1; } }',
      );
      const jar = path.join(work, 'lib-sources.jar');
      const packed = spawnSync('jar', ['cf', jar, '-C', library, 'Lib.java'], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
      const [use = ''] = sources(1, 'class A0 { int value = Lib.one(); }');

      expect(packed.status, packed.stderr).toBe(0);
      expect(probe(['record', jar, mkdtempSync(path.join(work, 'out-')), use])).toBe(
        `true [${use}]`,
      );
    });

    it('keeps javac from compiling sources found on the class path', () => {
      expect(probe(['options', '-classpath', work])).toBe(`[-classpath, ${work}, -sourcepath, ]`);
    });

    it('leaves the source path alone for a module, whose sources must stay on it', () => {
      expect(probe(['modular', '-classpath', work])).toBe(`[-classpath, ${work}]`);
    });

    it('stops at the deadline with an empty report and the reason Error Prone was skipped', () => {
      const report = path.join(work, 'deadline', 'errorprone.json');
      const argumentsFile = path.join(work, 'deadline', 'arguments');
      mkdirSync(path.dirname(report), { recursive: true });
      writeFileSync(argumentsFile, ['-classpath', work, '--sources', ...sources(1)].join('\n'));

      const run = spawnSync(
        'java',
        ['-Dnitpicker.errorprone.deadline=1', REPORT_SOURCE, report, CHECKS_FILE, argumentsFile],
        { encoding: 'utf8', timeout: JAVA_TIMEOUT_MS },
      );

      expect(run.status, run.stderr).toBe(0);
      expect(readFileSync(report, 'utf8')).toBe('[]\n');
      expect(readFileSync(path.join(path.dirname(report), 'errorprone-skipped.txt'), 'utf8')).toBe(
        'it was stopped after 1 minute, at the time limit of the run; ' +
          'NITPICKER_MAVEN_TIMEOUT_MINUTES or NITPICKER_GRADLE_TIMEOUT_MINUTES give it more time\n',
      );
    });

    it('isolates -d and -s per slice, keeps -classpath intact, and cleans up temporary folders', () => {
      const classes = path.join(work, 'orig-classes');
      const generated = path.join(work, 'orig-generated');
      const [optionsLine = '', existed = '', cleaned = ''] = probe([
        'isolate',
        '-d',
        classes,
        '-s',
        generated,
        '-classpath',
        work,
      ]).split('\n');
      const isolated = optionsLine.split('|');

      expect(isolated[0]).toBe('-d');
      expect(isolated[1]).not.toBe(classes);
      expect(isolated[2]).toBe('-s');
      expect(isolated[3]).not.toBe(generated);
      expect(isolated[1]).not.toBe(isolated[3]);
      expect(isolated.slice(4)).toEqual(['-classpath', work]);
      expect(existed).toBe('true');
      expect(cleaned).toBe('true');

      const [noOutputOptions = '', noOutputExisted = '', noOutputCleaned = ''] = probe([
        'isolate',
        '-cp',
        work,
      ]).split('\n');
      expect(noOutputOptions).toBe(`-cp|${work}`);
      expect(noOutputExisted).toBe('true');
      expect(noOutputCleaned).toBe('true');
    });

    it('marks sliced jobs and keeps ownClasses on the classpath when splitting a source set', () => {
      const files = sources(90);
      const ownClasses = mkdtempSync(path.join(work, 'own-classes-'));
      const argumentsFile = path.join(mkdtempSync(path.join(work, 'job-args-')), 'arguments');
      writeFileSync(
        argumentsFile,
        [
          '-d',
          path.join(work, 'shared-d'),
          '-s',
          path.join(work, 'shared-s'),
          '-cp',
          work,
          `--own-classes=${ownClasses}`,
          '--sources',
          ...files,
        ].join('\n'),
      );

      const single = probe(
        ['jobs', CHECKS_FILE, argumentsFile],
        ['-Dnitpicker.errorprone.workers=1'],
      )
        .trim()
        .split('\n');
      expect(single).toHaveLength(1);
      expect(single[0]?.startsWith('false|90|')).toBe(true);

      const parallel = probe(
        ['jobs', CHECKS_FILE, argumentsFile],
        ['-Dnitpicker.errorprone.workers=2'],
      )
        .trim()
        .split('\n');
      expect(parallel).toHaveLength(2);
      for (const line of parallel) {
        const [sliced, , cp] = line.split('|');
        expect(sliced).toBe('true');
        expect(cp).toContain(ownClasses);
      }
    });

    it('prevents concurrent index-writing annotation processors from corrupting each other across slices', () => {
      const procDir = mkdtempSync(path.join(work, 'ap-'));
      const procClasses = mkdtempSync(path.join(work, 'ap-classes-'));
      const ownClasses = mkdtempSync(path.join(work, 'ap-own-'));
      const sharedD = mkdtempSync(path.join(work, 'ap-shared-d-'));
      const sharedS = mkdtempSync(path.join(work, 'ap-shared-s-'));
      const srcDir = mkdtempSync(path.join(work, 'ap-src-'));

      const processorSource = path.join(procDir, 'IndexProcessor.java');
      writeFileSync(
        processorSource,
        `import java.io.*;
import java.util.*;
import javax.annotation.processing.*;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.*;
import javax.tools.*;

@SupportedAnnotationTypes("*")
@SupportedSourceVersion(SourceVersion.RELEASE_17)
public final class IndexProcessor extends AbstractProcessor {
  private boolean written;

  @Override
  public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment round) {
    if (written || round.processingOver()) {
      return false;
    }
    written = true;
    try {
      List<String> names = round.getRootElements().stream().map(Element::getSimpleName).map(Object::toString).toList();
      FileObject index = processingEnv.getFiler().createResource(
          StandardLocation.CLASS_OUTPUT, "", "META-INF/annotations/test.Index");
      try (ObjectOutputStream out = new ObjectOutputStream(index.openOutputStream())) {
        for (int i = 0; i < 64; i++) {
          out.writeObject(names);
        }
      }
      java.nio.file.Path indexPath = java.nio.file.Path.of(index.toUri());
      try (ObjectInputStream in = new ObjectInputStream(java.nio.file.Files.newInputStream(indexPath))) {
        in.readObject();
      }
      String genName = "Generated_" + String.join("_", names);
      JavaFileObject gen = processingEnv.getFiler().createSourceFile(genName);
      try (Writer writer = gen.openWriter()) {
        writer.write("public final class " + genName + " {}");
      }
    } catch (Exception failure) {
      throw new RuntimeException(failure);
    }
    return false;
  }
}
`,
      );

      const procCompile = spawnSync('javac', ['-d', procClasses, processorSource], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
      expect(procCompile.status, procCompile.stderr).toBe(0);

      const first = path.join(srcDir, 'First.java');
      const second = path.join(srcDir, 'Second.java');
      writeFileSync(first, 'public class First { public static int value() { return 42; } }');
      writeFileSync(second, 'public class Second { int v = First.value(); }');

      const precompile = spawnSync('javac', ['-d', ownClasses, first, second], {
        encoding: 'utf8',
        timeout: JAVA_TIMEOUT_MS,
      });
      expect(precompile.status, precompile.stderr).toBe(0);

      const result = probe([
        'parallel-ap',
        procClasses,
        ownClasses,
        sharedD,
        sharedS,
        first,
        second,
      ]);
      expect(result).toBe('true true true');
      expect(readdirSync(sharedD)).toEqual([]);
      expect(readdirSync(sharedS)).toEqual([]);
    });
  },
);
