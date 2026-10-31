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
import nitpicker.designfacts.facts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class DesignFacts {
  private static final int MAX_REPORTED_ERRORS = 5;

  private DesignFacts() {}

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path root = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = sourceFiles(root, Path.of(args[2]));
    List<String> errors = new ArrayList<>();
    List<Unit> units = files.isEmpty() ? List.of() : parse(root, files, errors);
    if (!errors.isEmpty()) {
      System.err.println("DesignFacts could not parse the sources:");
      errors.stream().limit(MAX_REPORTED_ERRORS).forEach(System.err::println);
      System.exit(1);
    }
    String json = JsonOut.of(facts(root, units)) + "\n";
    Files.writeString(output, json, StandardCharsets.UTF_8);
  }

  private static List<Path> sourceFiles(Path root, Path list) throws IOException {
    List<Path> files = new ArrayList<>();
    for (String line : Files.readAllLines(list, StandardCharsets.UTF_8)) {
      if (!line.isBlank()) {
        files.add(root.resolve(line).normalize());
      }
    }
    return files;
  }

  private static JavaCompiler compiler() {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("Running on a JRE without jdk.compiler; a JDK is required");
    }
    return compiler;
  }

  private static List<Unit> parse(Path root, List<Path> files, List<String> errors)
      throws IOException {
    JavaCompiler compiler = compiler();
    DiagnosticListener<JavaFileObject> listener =
        diagnostic -> {
          if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
            errors.add(describe(root, diagnostic));
          }
        };
    try (StandardJavaFileManager manager =
        compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
      Iterable<? extends JavaFileObject> sources = manager.getJavaFileObjectsFromPaths(files);
      List<String> options = List.of("-proc:none");
      JavacTask task =
          (JavacTask) compiler.getTask(null, manager, listener, options, null, sources);
      SourcePositions positions = Trees.instance(task).getSourcePositions();
      List<Unit> units = new ArrayList<>();
      for (CompilationUnitTree tree : task.parse()) {
        units.add(new Unit(relative(root, Path.of(tree.getSourceFile().toUri())), tree, positions));
      }
      return units;
    }
  }

  private static String relative(Path root, Path file) {
    return root.relativize(file).toString().replace('\\', '/');
  }

  private static String describe(Path root, Diagnostic<? extends JavaFileObject> diagnostic) {
    JavaFileObject source = diagnostic.getSource();
    String where = source == null ? "" : relative(root, Path.of(source.toUri()));
    return where + ":" + diagnostic.getLineNumber() + ": " + diagnostic.getMessage(Locale.ROOT);
  }

  private static Map<String, Object> facts(Path root, List<Unit> units) {
    Project project = new Project(units);
    Prepare.run(project, root);
    Lookup lookup = new Lookup(project);
    Typer typer = new Typer(project, lookup);
    TypeFacts typeFacts = new TypeFacts(new Mutability(typer), project);
    CallableFacts callableFacts = new CallableFacts(typer, new Surface(project, lookup));
    Bundle bundle = new Bundle();
    for (TypeInfo type : project.types) {
      if (type.designKind != null) {
        bundle.types.add(typeFacts.build(type));
        bundle.addCallables(type, callableFacts);
      }
    }
    return bundle.toMap(units);
  }

  private static final class Bundle {
    private final List<Map<String, Object>> types = new ArrayList<>();
    private final List<Map<String, Object>> callables = new ArrayList<>();
    private final Set<String> starters = new HashSet<>();

    private void addCallables(TypeInfo type, CallableFacts callableFacts) {
      for (MethodInfo method : type.methods) {
        callables.add(callableFacts.build(method));
        if (method.tree != null && Surface.isMain(method)) {
          starters.add(type.unit.file);
        }
      }
    }

    private Map<String, Object> toMap(List<Unit> units) {
      List<Map<String, Object>> modules = new ArrayList<>();
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
}
