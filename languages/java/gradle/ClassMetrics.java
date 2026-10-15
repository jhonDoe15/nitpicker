import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import javax.lang.model.element.Modifier;
import javax.tools.*;

public final class ClassMetrics {
  private static final int MAX_REPORTED_ERRORS = 5;

  private static String relative(Path projectDir, Path file) {
    return projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
  }

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path projectDir = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = new ArrayList<>();
    for (int i = 2; i < args.length; i++) {
      Path root = projectDir.resolve(args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(".java")).sorted().forEach(files::add);
        }
      }
    }
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("Running on a JRE without jdk.compiler; a JDK is required");
    }
    List<String> classes = new ArrayList<>();
    List<String> fileEntries = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    try (StandardJavaFileManager fm =
        compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
      for (Path file : files) {
        JavacTask task =
            (JavacTask)
                compiler.getTask(
                    null,
                    fm,
                    d -> {
                      if (d.getKind() == Diagnostic.Kind.ERROR) {
                        errors.add(relative(projectDir, file) + ":" + d.getLineNumber() + ": "
                            + d.getMessage(Locale.ROOT));
                      }
                    },
                    List.of("-proc:none"),
                    null,
                    fm.getJavaFileObjects(file.toFile()));
        SourcePositions positions = Trees.instance(task).getSourcePositions();
        String relative = relative(projectDir, file);
        for (CompilationUnitTree unit : task.parse()) {
          fileEntries.add(describeFile(relative, unit));
          new Collector(unit, positions, relative, classes).scan(unit, "");
        }
      }
    }
    if (!errors.isEmpty()) {
      System.err.println("ClassMetrics could not parse the sources:");
      errors.stream().limit(MAX_REPORTED_ERRORS).forEach(System.err::println);
      System.exit(1);
    }
    Files.writeString(
        output,
        "{\"files\":{" + String.join(",", fileEntries) + "},\"classes\":["
            + String.join(",", classes) + "]}\n",
        StandardCharsets.UTF_8);
  }

  private static String describeFile(String file, CompilationUnitTree unit) {
    String packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
    String imports =
        unit.getImports().stream()
            .filter(i -> !i.isStatic())
            .map(i -> quote(i.getQualifiedIdentifier().toString()))
            .collect(Collectors.joining(","));
    return quote(file) + ":{\"package\":" + quote(packageName) + ",\"imports\":[" + imports + "]}";
  }

  private static final class Collector extends TreeScanner<Void, String> {
    private final CompilationUnitTree unit;
    private final SourcePositions positions;
    private final String file;
    private final List<String> classes;

    Collector(
        CompilationUnitTree unit, SourcePositions positions, String file, List<String> classes) {
      this.unit = unit;
      this.positions = positions;
      this.file = file;
      this.classes = classes;
    }

    @Override
    public Void visitClass(ClassTree tree, String owner) {
      String simple = tree.getSimpleName().toString();
      if (simple.isEmpty()) {
        return super.visitClass(tree, owner);
      }
      String qualified = owner.isEmpty() ? simple : owner + "." + simple;
      classes.add(describe(tree, qualified));
      for (Tree member : tree.getMembers()) {
        scan(member, qualified);
      }
      return null;
    }

    private String describe(ClassTree tree, String name) {
      int methods = 0;
      int fields = 0;
      for (Tree member : tree.getMembers()) {
        if (member instanceof MethodTree method && !method.getName().contentEquals("<init>")) {
          methods += 1;
        } else if (member instanceof VariableTree variable && countsAsField(tree, variable)) {
          fields += 1;
        }
      }
      long start = positions.getStartPosition(unit, tree);
      String extendsName = tree.getKind() == Tree.Kind.CLASS ? superclass(tree) : null;
      return "{\"file\":" + quote(file)
          + ",\"name\":" + quote(name)
          + ",\"start\":" + unit.getLineMap().getLineNumber(start)
          + ",\"kind\":" + quote(tree.getKind().toString().toLowerCase(Locale.ROOT).replace("_type", ""))
          + ",\"methods\":" + methods
          + ",\"fields\":" + fields
          + (extendsName == null ? "" : ",\"extends\":" + quote(extendsName))
          + "}";
    }
  }

  private static String superclass(ClassTree tree) {
    Tree extendsClause = tree.getExtendsClause();
    if (extendsClause == null) {
      return null;
    }
    Tree raw = extendsClause instanceof ParameterizedTypeTree generic ? generic.getType() : extendsClause;
    return raw.toString();
  }

  private static boolean countsAsField(ClassTree owner, VariableTree variable) {
    Set<Modifier> flags = variable.getModifiers().getFlags();
    boolean inInterface =
        owner.getKind() == Tree.Kind.INTERFACE || owner.getKind() == Tree.Kind.ANNOTATION_TYPE;
    return !inInterface && !flags.contains(Modifier.STATIC) && !isEnumConstant(owner, variable);
  }

  private static boolean isEnumConstant(ClassTree owner, VariableTree variable) {
    return owner.getKind() == Tree.Kind.ENUM
        && variable.getInitializer() instanceof NewClassTree
        && variable.getType().toString().equals(owner.getSimpleName().toString());
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        default -> out.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
      }
    }
    return out.append('"').toString();
  }
}
