import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import javax.lang.model.element.Modifier;
import javax.tools.*;

public final class StructureMetrics {
  private static final int MAX_REPORTED_ERRORS = 5;

  private static String relative(Path projectDir, Path file) {
    return projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
  }

  private static String describe(Path projectDir, Diagnostic<? extends JavaFileObject> d) {
    String where = d.getSource() == null ? "" : relative(projectDir, Path.of(d.getSource().toUri()));
    return where + ":" + d.getLineNumber() + ": " + d.getMessage(Locale.ROOT);
  }

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path classesOutput = Path.of(args[1]);
    Path projectDir = Path.of(args[2]).toAbsolutePath().normalize();
    List<Path> files = new ArrayList<>();
    for (int i = 3; i < args.length; i++) {
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
                        errors.add(describe(projectDir, d));
                      }
                    },
                    List.of("-proc:none"),
                    null,
                    fm.getJavaFileObjects(file.toFile()));
        SourcePositions positions = Trees.instance(task).getSourcePositions();
        String relative = relative(projectDir, file);
        for (CompilationUnitTree unit : task.parse()) {
          new Collector(unit, positions, relative, entries).scan(unit, "");
          fileEntries.add(describeFile(relative, unit));
          new ClassCollector(unit, positions, relative, classes).scan(unit, "");
        }
      }
    }
    if (!errors.isEmpty()) {
      System.err.println("StructureMetrics could not parse the sources:");
      errors.stream().limit(MAX_REPORTED_ERRORS).forEach(System.err::println);
      System.exit(1);
    }
    Files.writeString(
        output, "[" + String.join(",", entries) + "]\n", StandardCharsets.UTF_8);
    Files.writeString(
        classesOutput,
        "{\"files\":{" + String.join(",", fileEntries) + "},\"classes\":["
            + String.join(",", classes) + "]}\n",
        StandardCharsets.UTF_8);
  }

  /** Walks types and reports each method, constructor, initializer and lambda with the name of its enclosing types. */
  private static final class Collector extends TreeScanner<Void, String> {
    private final CompilationUnitTree unit;
    private final SourcePositions positions;
    private final String file;
    private final List<String> entries;
    private final Deque<List<? extends TypeParameterTree>> typeScopes = new ArrayDeque<>();

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
      typeScopes.push(tree.getTypeParameters());
      for (Tree member : tree.getMembers()) {
        scan(member, qualified);
      }
      typeScopes.pop();
      return null;
    }

    @Override
    public Void visitMethod(MethodTree tree, String owner) {
      if (tree.getBody() != null) {
        report(tree, owner);
        typeScopes.push(tree.getTypeParameters());
        nested(tree.getBody(), owner, owner + "." + methodName(tree, owner));
        typeScopes.pop();
      }
      return null;
    }

    @Override
    public Void visitVariable(VariableTree tree, String owner) {
      ExpressionTree initializer = tree.getInitializer();
      if (initializer == null) {
        return null;
      }
      String scope = owner + "." + tree.getName();
      LambdaExpressionTree lambda = lambdaOf(initializer);
      if (lambda != null) {
        lambdaUnit(lambda, owner, scope);
        return null;
      }
      Body body = new Body();
      body.statements = 1;
      body.scan(initializer, 0);
      Complexity complexity = new Complexity();
      complexity.scan(initializer, null);
      if (complexity.branches > 0 || body.maxNesting > 0) {
        add(tree, new Metrics(scope, scope, body, complexity, 0, "\"initializer\":true"));
      }
      nested(initializer, owner, scope);
      return null;
    }

    @Override
    public Void visitBlock(BlockTree tree, String owner) {
      String scope = owner + (tree.isStatic() ? ".<clinit>" : ".<init>");
      if (!tree.getStatements().isEmpty()) {
        Body body = new Body();
        body.scan(tree, 0);
        Complexity complexity = new Complexity();
        complexity.scan(tree, null);
        add(tree, new Metrics(scope, scope, body, complexity, 0, "\"initializer\":true"));
      }
      nested(tree, owner, scope);
      return null;
    }

    private void lambdaUnit(LambdaExpressionTree lambda, String owner, String scope) {
      Body body = new Body();
      body.statements = lambda.getBody() instanceof BlockTree ? 0 : 1;
      body.scan(lambda.getBody(), 0);
      Complexity complexity = new Complexity();
      complexity.scan(lambda.getBody(), null);
      add(
          lambda,
          new Metrics(scope, scope, body, complexity, lambda.getParameters().size(), "\"lambda\":true"));
      nested(lambda.getBody(), owner, scope);
    }

    /** Finds the classes and lambdas below a unit's body; each is a unit of its own. */
    private void nested(Tree root, String owner, String scope) {
      new TreeScanner<Void, String>() {
        @Override
        public Void visitClass(ClassTree inner, String parent) {
          Collector.this.visitClass(inner, owner);
          return null;
        }

        @Override
        public Void visitLambdaExpression(LambdaExpressionTree lambda, String parent) {
          lambdaUnit(lambda, owner, parent + ".<lambda>");
          return null;
        }

        @Override
        public Void visitVariable(VariableTree variable, String parent) {
          LambdaExpressionTree lambda =
              variable.getInitializer() == null ? null : lambdaOf(variable.getInitializer());
          if (lambda == null) {
            return super.visitVariable(variable, parent);
          }
          lambdaUnit(lambda, owner, parent + "." + variable.getName());
          return null;
        }
      }.scan(root, scope);
    }

    private Map<String, TypeParameterTree> typeVariables(MethodTree tree) {
      Map<String, TypeParameterTree> variables = new HashMap<>();
      typeScopes.descendingIterator().forEachRemaining(scope -> declare(variables, scope));
      declare(variables, tree.getTypeParameters());
      return variables;
    }

    private static void declare(
        Map<String, TypeParameterTree> variables, List<? extends TypeParameterTree> scope) {
      scope.forEach(parameter -> variables.put(parameter.getName().toString(), parameter));
    }

    private static String methodName(MethodTree tree, String owner) {
      return tree.getName().contentEquals("<init>")
          ? owner.substring(owner.lastIndexOf('.') + 1)
          : tree.getName().toString();
    }

    private void report(MethodTree tree, String owner) {
      Body body = new Body();
      body.scan(tree.getBody(), 0);
      Complexity complexity = new Complexity();
      complexity.scan(tree.getBody(), null);
      String name = methodName(tree, owner);
      add(
          tree,
          new Metrics(
              owner + "." + name,
              signature(owner, name, tree),
              body,
              complexity,
              tree.getParameters().size(),
              "\"parameterTypes\":"
                  + parameterTypes(tree, typeVariables(tree))
                  + (isPrivateEmptyConstructor(tree) ? ",\"privateEmptyConstructor\":true" : "")));
    }

    private void add(Tree node, Metrics metrics) {
      long start = positions.getStartPosition(unit, node);
      long end = positions.getEndPosition(unit, node);
      LineMap lines = unit.getLineMap();
      long startLine = lines.getLineNumber(start);
      long endLine = lines.getLineNumber(Math.max(start, end - 1));
      entries.add(
          "{\"file\":" + quote(file)
              + ",\"name\":" + quote(metrics.name)
              + ",\"start\":" + startLine
              + ",\"end\":" + endLine
              + ",\"lines\":" + (endLine - startLine + 1)
              + ",\"statements\":" + metrics.body.statements
              + ",\"maxControlNesting\":" + metrics.body.maxNesting
              + ",\"parameters\":" + metrics.parameters
              + ",\"complexity\":" + (1 + metrics.complexity.branches)
              + ",\"signature\":" + quote(metrics.signature)
              + "," + metrics.extra
              + "}");
    }
  }

  private record Metrics(
      String name, String signature, Body body, Complexity complexity, int parameters, String extra) {}

  private static LambdaExpressionTree lambdaOf(ExpressionTree expression) {
    return switch (expression) {
      case LambdaExpressionTree lambda -> lambda;
      case ParenthesizedTree parenthesized -> lambdaOf(parenthesized.getExpression());
      case TypeCastTree cast -> lambdaOf(cast.getExpression());
      default -> null;
    };
  }

  /** Statement count and control nesting of one body; nested classes are not entered. */
  private static final class Body extends TreeScanner<Void, Integer> {
    int statements = 0;
    int maxNesting = 0;
    private final Set<Tree> continuedIfs = Collections.newSetFromMap(new IdentityHashMap<>());

    @Override
    public Void scan(Tree tree, Integer depth) {
      if (tree == null || tree instanceof ClassTree || tree instanceof LambdaExpressionTree) {
        return null; // nested classes and lambdas are reported on their own
      }
      if (tree instanceof StatementTree && !(tree instanceof BlockTree)) {
        statements += 1;
      }
      if (tree instanceof IfTree branch && branch.getElseStatement() instanceof IfTree continued) {
        continuedIfs.add(continued);
      }
      int next = isControl(tree) && !continuedIfs.contains(tree) ? depth + 1 : depth;
      maxNesting = Math.max(maxNesting, next);
      return super.scan(tree, next);
    }

    // An `else if` continues the chain of its `if` and opens no level of its own, as in the TypeScript analyzer.
    @Override
    public Void visitIf(IfTree tree, Integer depth) {
      scan(tree.getCondition(), depth);
      scan(tree.getThenStatement(), depth);
      Tree other = tree.getElseStatement();
      if (other instanceof IfTree chained) {
        statements += 1;
        return visitIf(chained, depth);
      }
      scan(other, depth);
      return null;
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

  private static final class Complexity extends TreeScanner<Void, Void> {
    int branches = 0;

    @Override
    public Void scan(Tree tree, Void ignored) {
      if (tree == null || tree instanceof ClassTree || tree instanceof LambdaExpressionTree) {
        return null;
      }
      if (isBranch(tree)) {
        branches += 1;
      }
      return super.scan(tree, ignored);
    }

    @Override
    public Void visitSwitchExpression(SwitchExpressionTree tree, Void ignored) {
      return isFlat(tree.getKind(), tree.getCases())
          ? countOnce(tree.getExpression(), tree.getCases())
          : super.visitSwitchExpression(tree, ignored);
    }

    @Override
    public Void visitSwitch(SwitchTree tree, Void ignored) {
      return isFlat(tree.getKind(), tree.getCases())
          ? countOnce(tree.getExpression(), tree.getCases())
          : super.visitSwitch(tree, ignored);
    }

    private Void countOnce(ExpressionTree selector, List<? extends CaseTree> cases) {
      long counted = cases.stream().filter(arm -> !isDefault(arm)).count();
      long guards = cases.stream().filter(arm -> arm.getGuard() != null).count();
      branches += (int) Math.min(counted, 1 + guards);
      scan(selector, null);
      for (CaseTree arm : cases) {
        scan(arm.getGuard(), null);
        scan(arm.getBody(), null);
      }
      return null;
    }
  }

  private static boolean isFlat(Tree.Kind kind, List<? extends CaseTree> cases) {
    boolean exhaustive =
        kind == Tree.Kind.SWITCH_EXPRESSION
            || cases.stream()
                .flatMap(arm -> arm.getLabels().stream())
                .anyMatch(label -> label.getKind() == Tree.Kind.PATTERN_CASE_LABEL);
    return exhaustive
        && !cases.isEmpty()
        && cases.stream()
            .allMatch(
                arm ->
                    arm.getCaseKind() == CaseTree.CaseKind.RULE
                        && !(arm.getBody() instanceof BlockTree));
  }

  private static boolean isBranch(Tree tree) {
    return switch (tree.getKind()) {
      case IF, FOR_LOOP, ENHANCED_FOR_LOOP, WHILE_LOOP, DO_WHILE_LOOP, CATCH, CONDITIONAL_EXPRESSION,
          CONDITIONAL_AND, CONDITIONAL_OR -> true;
      case CASE -> !isDefault((CaseTree) tree);
      default -> false;
    };
  }

  private static boolean isDefault(CaseTree tree) {
    return tree.getLabels().stream().anyMatch(label -> label.getKind() == Tree.Kind.DEFAULT_CASE_LABEL);
  }

  private static String signature(String owner, String name, MethodTree tree) {
    String types =
        tree.getParameters().stream()
            .map(parameter -> parameter.getType().toString())
            .collect(Collectors.joining(", "));
    return owner + "." + name + "(" + types + ")";
  }

  private static String parameterTypes(
      MethodTree tree, Map<String, TypeParameterTree> variables) {
    return tree.getParameters().stream()
        .map(parameter -> quote(erasedName(parameter.getType(), variables)))
        .collect(Collectors.joining(",", "[", "]"));
  }

  private static String erasedName(Tree type, Map<String, TypeParameterTree> variables) {
    return switch (type) {
      case ParameterizedTypeTree parameterized -> erasedName(parameterized.getType(), variables);
      case ArrayTypeTree array -> erasedName(array.getType(), variables) + "[]";
      case AnnotatedTypeTree annotated -> erasedName(annotated.getUnderlyingType(), variables);
      case MemberSelectTree select -> select.getIdentifier().toString();
      case IdentifierTree identifier when variables.containsKey(identifier.getName().toString()) ->
          erasure(variables.get(identifier.getName().toString()), variables);
      default -> type.toString();
    };
  }

  private static String erasure(TypeParameterTree variable, Map<String, TypeParameterTree> variables) {
    Map<String, TypeParameterTree> outer = new HashMap<>(variables);
    outer.remove(variable.getName().toString());
    return variable.getBounds().isEmpty() ? "Object" : erasedName(variable.getBounds().get(0), outer);
  }

  private static boolean isPrivateEmptyConstructor(MethodTree tree) {
    List<? extends StatementTree> statements = tree.getBody().getStatements();
    return tree.getName().contentEquals("<init>")
        && tree.getModifiers().getFlags().contains(Modifier.PRIVATE)
        && tree.getParameters().isEmpty()
        && statements.stream().allMatch(StructureMetrics::isSuperCall);
  }

  private static boolean isSuperCall(StatementTree statement) {
    return statement instanceof ExpressionStatementTree call
        && call.getExpression() instanceof MethodInvocationTree invocation
        && invocation.getMethodSelect().toString().equals("super")
        && invocation.getArguments().isEmpty();
  }

  private static boolean isControl(Tree tree) {
    return switch (tree.getKind()) {
      case IF, FOR_LOOP, ENHANCED_FOR_LOOP, WHILE_LOOP, DO_WHILE_LOOP, SWITCH, SWITCH_EXPRESSION,
          CATCH -> true;
      default -> false;
    };
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

  private static final class ClassCollector extends TreeScanner<Void, String> {
    private final CompilationUnitTree unit;
    private final SourcePositions positions;
    private final String file;
    private final List<String> classes;

    ClassCollector(
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
