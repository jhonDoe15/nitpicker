// Per-method structure metrics for the Java preset (java/nitpicker.init.gradle, task
// nitpickerStructure). Run in the JDK's single-file source mode, so it needs no dependency beyond
// the JDK that already runs Gradle: it parses (never compiles) the main sources with the compiler
// tree API (jdk.compiler) and writes one JSON object per method and constructor.
//
//   java StructureMetrics.java <output.json> <projectDir> <sourceRoot>...
//
// Metrics follow the TypeScript structure analyzer so both languages enforce the same limits:
//   lines              last line - first line + 1 (annotations and modifiers included, Javadoc not)
//   statements         every statement below the body except blocks
//   maxControlNesting  deepest nesting of if, for, enhanced for, while, do, switch and catch
//   parameters         declared parameters
// Members of nested classes (anonymous, local or member) are reported as methods of their own and
// do not count towards the enclosing method; lambda bodies count towards the enclosing method.

import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import javax.tools.*;

public final class StructureMetrics {
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
    List<String> entries = new ArrayList<>();
    try (StandardJavaFileManager fm =
        compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
      for (Path file : files) {
        JavacTask task =
            (JavacTask)
                compiler.getTask(
                    null,
                    fm,
                    d -> {},
                    List.of("-proc:none"),
                    null,
                    fm.getJavaFileObjects(file.toFile()));
        SourcePositions positions = Trees.instance(task).getSourcePositions();
        String relative =
            projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
        for (CompilationUnitTree unit : task.parse()) {
          new Collector(unit, positions, relative, entries).scan(unit, "");
        }
      }
    }
    Files.writeString(
        output, "[" + String.join(",", entries) + "]\n", StandardCharsets.UTF_8);
  }

  /** Walks types and reports each method and constructor with the name of its enclosing types. */
  private static final class Collector extends TreeScanner<Void, String> {
    private final CompilationUnitTree unit;
    private final SourcePositions positions;
    private final String file;
    private final List<String> entries;

    Collector(
        CompilationUnitTree unit, SourcePositions positions, String file, List<String> entries) {
      this.unit = unit;
      this.positions = positions;
      this.file = file;
      this.entries = entries;
    }

    @Override
    public Void visitClass(ClassTree tree, String owner) {
      String simple = tree.getSimpleName().toString();
      String name = simple.isEmpty() ? "<anonymous>" : simple;
      String qualified = owner.isEmpty() ? name : owner + "." + name;
      for (Tree member : tree.getMembers()) {
        scan(member, qualified);
      }
      return null;
    }

    @Override
    public Void visitMethod(MethodTree tree, String owner) {
      if (tree.getBody() != null) {
        report(tree, owner);
        visitNestedTypes(tree.getBody(), owner);
      }
      return null;
    }

    @Override
    public Void visitVariable(VariableTree tree, String owner) {
      // Field initializers can hold anonymous classes with methods.
      if (tree.getInitializer() != null) {
        visitNestedTypes(tree.getInitializer(), owner);
      }
      return null;
    }

    @Override
    public Void visitBlock(BlockTree tree, String owner) {
      // Initializer blocks are not methods, but may declare nested types.
      visitNestedTypes(tree, owner);
      return null;
    }

    private void visitNestedTypes(Tree root, String owner) {
      new TreeScanner<Void, Void>() {
        @Override
        public Void visitClass(ClassTree inner, Void ignored) {
          Collector.this.visitClass(inner, owner);
          return null;
        }
      }.scan(root, null);
    }

    private void report(MethodTree tree, String owner) {
      long start = positions.getStartPosition(unit, tree);
      long end = positions.getEndPosition(unit, tree);
      LineMap lines = unit.getLineMap();
      long startLine = lines.getLineNumber(start);
      long endLine = lines.getLineNumber(Math.max(start, end - 1));
      Body body = new Body();
      body.scan(tree.getBody(), 0);
      String name =
          tree.getName().contentEquals("<init>")
              ? owner.substring(owner.lastIndexOf('.') + 1)
              : tree.getName().toString();
      entries.add(
          "{\"file\":" + quote(file)
              + ",\"name\":" + quote(owner + "." + name)
              + ",\"start\":" + startLine
              + ",\"end\":" + endLine
              + ",\"lines\":" + (endLine - startLine + 1)
              + ",\"statements\":" + body.statements
              + ",\"maxControlNesting\":" + body.maxNesting
              + ",\"parameters\":" + tree.getParameters().size()
              + "}");
    }
  }

  /** Statement count and control nesting of one body; nested classes are not entered. */
  private static final class Body extends TreeScanner<Void, Integer> {
    int statements = 0;
    int maxNesting = 0;

    @Override
    public Void scan(Tree tree, Integer depth) {
      if (tree == null || tree instanceof ClassTree) {
        return null; // nested classes are reported on their own
      }
      if (tree instanceof StatementTree && !(tree instanceof BlockTree)) {
        statements += 1;
      }
      int next = isControl(tree) ? depth + 1 : depth;
      maxNesting = Math.max(maxNesting, next);
      return super.scan(tree, next);
    }

    // A `for` header's initializers and updates, a `catch` parameter and a `try` resource are javac statements or
    // variables but not statements of the body (the TypeScript analyzer does not count them).
    @Override
    public Void visitForLoop(ForLoopTree tree, Integer depth) {
      scan(tree.getCondition(), depth);
      scan(tree.getStatement(), depth);
      return null;
    }

    @Override
    public Void visitCatch(CatchTree tree, Integer depth) {
      scan(tree.getBlock(), depth);
      return null;
    }

    @Override
    public Void visitTry(TryTree tree, Integer depth) {
      scan(tree.getBlock(), depth);
      scan(tree.getCatches(), depth);
      scan(tree.getFinallyBlock(), depth);
      return null;
    }
  }

  private static boolean isControl(Tree tree) {
    return switch (tree.getKind()) {
      case IF, FOR_LOOP, ENHANCED_FOR_LOOP, WHILE_LOOP, DO_WHILE_LOOP, SWITCH, SWITCH_EXPRESSION,
          CATCH -> true;
      default -> false;
    };
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (c < 0x20) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }
}
