package nitpicker.effects;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import nitpicker.effects.classes.ClassIndex;
import nitpicker.effects.classes.ClassPath;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.jpa.Entities;
import nitpicker.effects.rules.AccumulatorCopy;
import nitpicker.effects.rules.HeldScope;
import nitpicker.effects.rules.LazyRelation;
import nitpicker.effects.rules.LoopIo;
import nitpicker.effects.scopes.Scopes;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;

public final class Effects {
  private Effects() {}

  public static void main(String[] args) throws IOException {
    if (args.length != 2) {
      System.err.println("usage: Effects <output.json> <input.txt>");
      System.exit(2);
    }
    List<String> mainDirectories = new ArrayList<>();
    List<String> classPath = new ArrayList<>();
    List<String> dependencies = new ArrayList<>();
    Map<String, String> options = new HashMap<>();
    for (String line : Files.readAllLines(Path.of(args[1]), StandardCharsets.UTF_8)) {
      int space = line.indexOf(' ');
      if (space < 0) {
        continue;
      }
      String value = line.substring(space + 1);
      switch (line.substring(0, space)) {
        case "main" -> mainDirectories.add(value);
        case "classpath" -> classPath.add(value);
        case "dependency" -> dependencies.add(value);
        case "option" -> options.put(value.split("=", 2)[0], value.contains("=") ? value.split("=", 2)[1] : "");
        default -> { }
      }
    }
    List<String> lookup = new ArrayList<>(mainDirectories);
    lookup.addAll(classPath);
    lookup.addAll(dependencies);
    Report report = new Report();
    try (ClassPath path = new ClassPath(lookup)) {
      ClassIndex index = new ClassIndex(path);
      for (String directory : mainDirectories) {
        load(index, Path.of(directory), report, false);
      }
      for (String dependency : dependencies) {
        load(index, Path.of(dependency), report, true);
      }
      Budget.begin(longOption(options, "timeBudgetSeconds"));
      run(new Program(index), report, options);
      report.unreadableLibraries(index.unreadable());
      int[] supertypes = index.supertypeCoverage();
      report.note("unresolved", Map.of("supertypes", supertypes[0], "total", supertypes[1]));
      report.note("degraded", Map.of("oversizedMethods", Budget.oversizedMethods(),
          "timeBudgetExceeded", Budget.expired()));
    }
    Files.writeString(Path.of(args[0]), report.toJson(), StandardCharsets.UTF_8);
  }

  static void run(Program program, Report report, Map<String, String> options) {
    Summaries summaries = new Summaries(program);
    summaries.compute();
    program.io((flow, index) -> flow.insns[index] instanceof MethodInsnNode call
        && summaries.kind(call.owner, call.name, call.desc) != null);
    new LoopIo(program, summaries, report).run();
    new AccumulatorCopy(program, report).run();
    new LazyRelation(program, new Entities(program.index, batchFetchSize(options) > 1), report).run();
    Scopes scopes = new Scopes(program);
    new HeldScope(program, summaries, scopes, report).run();
  }

  private static long longOption(Map<String, String> options, String key) {
    try {
      return Long.parseLong(options.getOrDefault(key, "0").trim());
    } catch (NumberFormatException unreadable) {
      return 0;
    }
  }

  private static int batchFetchSize(Map<String, String> options) {
    try {
      return Integer.parseInt(options.getOrDefault("batchFetchSize", "0").trim());
    } catch (NumberFormatException unreadable) {
      return 0;
    }
  }

  private static void load(ClassIndex index, Path source, Report report, boolean external) throws IOException {
    if (Files.isRegularFile(source) && source.getFileName().toString().endsWith(".jar")) {
      try (ZipFile jar = new ZipFile(source.toFile())) {
        for (ZipEntry entry : Collections.list(jar.entries())) {
          if (entry.getName().endsWith(".class") && classFile(Path.of(entry.getName()))) {
            try (InputStream bytes = jar.getInputStream(entry)) {
              add(index, bytes.readAllBytes(), report, external, source + "!" + entry.getName());
            }
          }
        }
      }
      return;
    }
    if (!Files.isDirectory(source)) {
      return;
    }
    try (Stream<Path> files = Files.walk(source)) {
      for (Path file : files.filter(Effects::classFile).sorted().toList()) {
        add(index, Files.readAllBytes(file), report, external, file.toString());
      }
    }
  }

  private static void add(ClassIndex index, byte[] bytes, Report report, boolean external, String origin) {
    try {
      ClassNode node = new ClassNode();
      new ClassReader(bytes).accept(node, 0);
      if (external) {
        index.addExternal(node);
        return;
      }
      index.addProject(node);
      report.loaded(1);
    } catch (RuntimeException unreadable) {
      if (!external) {
        report.skipped(1);
      }
      System.err.println("Effects skipped " + origin + ": " + unreadable);
    }
  }

  private static boolean classFile(Path file) {
    String name = file.getFileName().toString();
    return name.endsWith(".class") && !name.equals("module-info.class") && !name.equals("package-info.class");
  }
}
