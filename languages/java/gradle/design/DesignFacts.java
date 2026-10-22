package nitpicker.designfacts;

import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.Trees;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

public final class DesignFacts {
  private static final int MAX_REPORTED_ERRORS = 5;

  private DesignFacts() {}

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path root = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = new ArrayList<>();
    for (String line : Files.readAllLines(Path.of(args[2]), StandardCharsets.UTF_8)) {
      if (!line.isBlank()) {
        files.add(root.resolve(line).normalize());
      }
    }
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("Running on a JRE without jdk.compiler; a JDK is required");
    }
    List<String> errors = new ArrayList<>();
    List<Unit> units = new ArrayList<>();
    try (StandardJavaFileManager manager =
        compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
      JavacTask task =
          (JavacTask)
              compiler.getTask(
                  null,
                  manager,
                  diagnostic -> {
                    if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
                      errors.add(describe(root, diagnostic));
                    }
                  },
                  List.of("-proc:none"),
                  null,
                  manager.getJavaFileObjectsFromPaths(files));
      SourcePositions positions = Trees.instance(task).getSourcePositions();
      for (CompilationUnitTree tree : task.parse()) {
        Path file = Path.of(tree.getSourceFile().toUri());
        units.add(new Unit(root.relativize(file).toString().replace('\\', '/'), tree, positions));
      }
    }
    if (!errors.isEmpty()) {
      System.err.println("DesignFacts could not parse the sources:");
      errors.stream().limit(MAX_REPORTED_ERRORS).forEach(System.err::println);
      System.exit(1);
    }
    Files.writeString(output, JsonOut.of(facts(root, units)) + "\n", StandardCharsets.UTF_8);
  }

  private static String describe(Path root, Diagnostic<? extends JavaFileObject> diagnostic) {
    String where =
        diagnostic.getSource() == null
            ? ""
            : root.relativize(Path.of(diagnostic.getSource().toUri())).toString().replace('\\', '/');
    return where + ":" + diagnostic.getLineNumber() + ": " + diagnostic.getMessage(Locale.ROOT);
  }

  private static Map<String, Object> facts(Path root, List<Unit> units) {
    Project project = new Project(units);
    Prepare.run(project, root);
    Lookup lookup = new Lookup(project);
    Typer typer = new Typer(project, lookup);
    TypeFacts typeFacts = new TypeFacts(new Mutability(typer));
    CallableFacts callableFacts = new CallableFacts(typer, new Surface(project, lookup));
    List<Map<String, Object>> modules = new ArrayList<>();
    List<Map<String, Object>> types = new ArrayList<>();
    List<Map<String, Object>> callables = new ArrayList<>();
    Set<String> starters = new HashSet<>();
    for (TypeInfo type : project.types) {
      if (type.designKind == null) {
        continue;
      }
      types.add(typeFacts.build(type));
      for (MethodInfo method : type.methods) {
        callables.add(callableFacts.build(method));
        if (method.tree != null && Surface.isMain(method)) {
          starters.add(type.unit.file);
        }
      }
    }
    for (Unit unit : units) {
      Map<String, Object> module = new LinkedHashMap<>();
      module.put("file", unit.file);
      module.put("role", "production");
      module.put("entry", starters.contains(unit.file) ? Boolean.TRUE : null);
      modules.add(module);
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("modules", modules);
    result.put("types", types);
    result.put("callables", callables);
    return result;
  }
}
