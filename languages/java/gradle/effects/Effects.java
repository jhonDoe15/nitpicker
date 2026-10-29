package nitpicker.effects;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import nitpicker.effects.classes.ClassIndex;
import nitpicker.effects.classes.ClassPath;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.jpa.Entities;
import nitpicker.effects.rules.AccumulatorCopy;
import nitpicker.effects.rules.DualWrite;
import nitpicker.effects.rules.HeldScope;
import nitpicker.effects.rules.LazyRelation;
import nitpicker.effects.rules.LoopIo;
import nitpicker.effects.rules.RetryWrite;
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
        case "option" -> options.put(value.split("=", 2)[0], value.contains("=") ? value.split("=", 2)[1] : "");
        default -> { }
      }
    }
    List<String> lookup = new ArrayList<>(mainDirectories);
    lookup.addAll(classPath);
    Report report = new Report();
    try (ClassPath path = new ClassPath(lookup)) {
      ClassIndex index = new ClassIndex(path);
      for (String directory : mainDirectories) {
        load(index, Path.of(directory), report);
      }
      run(new Program(index), report, options);
      report.unreadableLibraries(index.unreadable());
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
    new RetryWrite(program, scopes, report).run();
    new DualWrite(program, report).run();
  }

  private static int batchFetchSize(Map<String, String> options) {
    try {
      return Integer.parseInt(options.getOrDefault("batchFetchSize", "0").trim());
    } catch (NumberFormatException unreadable) {
      return 0;
    }
  }

  private static void load(ClassIndex index, Path directory, Report report) throws IOException {
    if (!Files.isDirectory(directory)) {
      return;
    }
    try (Stream<Path> files = Files.walk(directory)) {
      for (Path file : files.filter(Effects::classFile).sorted().toList()) {
        try {
          ClassNode node = new ClassNode();
          new ClassReader(Files.readAllBytes(file)).accept(node, 0);
          index.addProject(node);
          report.loaded(1);
        } catch (RuntimeException unreadable) {
          report.skipped(1);
          System.err.println("Effects skipped " + file + ": " + unreadable);
        }
      }
    }
  }

  private static boolean classFile(Path file) {
    String name = file.getFileName().toString();
    return name.endsWith(".class") && !name.equals("module-info.class") && !name.equals("package-info.class");
  }
}
