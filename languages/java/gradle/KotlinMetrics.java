// Per-function metrics and class names of the Kotlin sources, for the Kotlin preset
// (languages/java/gradle/nitpicker.init.gradle, task nitpickerKotlinMetrics). Run in the JDK's
// single-file source mode with the Kotlin compiler on the class path, which parses (never
// compiles) the sources with the compiler's own PSI parser:
//
//   java -Dnitpicker.kotlinCompiler=<version> -cp <kotlin-compiler-embeddable and dependencies> KotlinMetrics.java <output.json> <projectDir> <sourceRoot>...
//
// Output: {"functions": [...], "files": [...]}. Every function with a body is one entry:
//   lines              last line - first line + 1 (annotations and modifiers included, KDoc and comments not)
//   statements         every element of a block, plus the unbraced body of an if, else, loop or when branch
//                      that is itself a statement, plus 1 for an expression body
//   maxControlNesting  deepest nesting of if, for, while, do, when and catch; a flat if / else if / else chain is
//                      one level, while an if inside an else { } block or inside a branch body nests one deeper
//   parameters         declared value parameters (the extension receiver is not one)
//   complexity         cyclomatic complexity: 1 + if, for, while, do, each when branch but else, catch,
//                      &&, || and ?: (the CRAP input; counted like StructureMetrics does for Java)
//   inline             true for an inline function or accessor: its body is copied into the callers, so
//                      JaCoCo never sees it run and its coverage (hence its CRAP score) cannot be measured
//   initializer        true for an init block or a property initializer that runs inside the class
//                      constructor or static initializer: JaCoCo has no method of its own for it, so
//                      its coverage is read from the coverage of its source lines
//   lambda             true for a lambda, an anonymous function or a local function: its coverage is
//                      JaCoCo's method for it, or, when the compiler inlined it into the caller, the
//                      coverage of its source lines
// A unit is a named function, a property accessor with a body, a secondary constructor with a block
// body, an init block with statements (named after its class, Foo.<init>; several blocks of a class share the name),
// a property whose initializer is a lambda or an anonymous function or whose delegate takes a lambda
// (by lazy { }), or a property whose other initializer holds a block (a lambda such as run { } or
// map { }, or braces of if, try and when) or is more than a straight line (complexity above 1 or control
// nesting); a property unit is named after the property. Members of nested, local and
// anonymous classes and objects, lambdas, anonymous functions and local functions are units of their
// own and do not count towards the enclosing function; a lambda is named after the unit that holds it
// and <lambda> (Foo.bar.<lambda>), or after the local property it initializes (Foo.bar.callback).
// Every file also lists its package and the JVM names of its top-level classes and, when it declares
// top-level functions or properties, of its file facade (the coupling step maps classes back to files
// with it, and the CRAP step finds the JaCoCo class of a file by package and file name). Of a
// @JvmMultifileClass facade, each file lists its own part (Facade__FileKt) and the first file the facade.
// A syntax error ends the run: the sources compiled, so the pinned compiler does not read them.

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import org.jetbrains.kotlin.cli.FrontendConfigurationKeysKt;
import org.jetbrains.kotlin.cli.common.messages.MessageCollector;
import org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.com.intellij.openapi.Disposable;
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiFileFactory;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.config.CommonConfigurationKeys;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.idea.KotlinLanguage;
import org.jetbrains.kotlin.psi.*;

public final class KotlinMetrics {
  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path projectDir = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = MetricsSupport.sourceFiles(projectDir, args, 2, ".kt");
    List<String> entries = new ArrayList<>();
    List<String> fileEntries = new ArrayList<>();
    Set<String> claimedFacades = new HashSet<>();
    Disposable disposable = Disposer.newDisposable();
    try {
      CompilerConfiguration configuration = new CompilerConfiguration();
      configuration.put(CommonConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.Companion.getNONE());
      FrontendConfigurationKeysKt.setExtensionsStorage(
          configuration, new CompilerPluginRegistrar.ExtensionStorage());
      KotlinCoreEnvironment environment =
          KotlinCoreEnvironment.createForProduction(
              disposable, configuration, EnvironmentConfigFiles.JVM_CONFIG_FILES);
      PsiFileFactory factory = PsiFileFactory.getInstance(environment.getProject());
      for (Path file : files.stream().distinct().collect(Collectors.toList())) {
        String relative = MetricsSupport.relative(projectDir, file);
        String text = Files.readString(file, StandardCharsets.UTF_8);
        if (text.startsWith("\uFEFF")) {
          text = text.substring(1);
        }
        text = text.replace("\r\n", "\n").replace('\r', '\n');
        KtFile ktFile =
            (KtFile)
                factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
        PsiErrorElement error = PsiTreeUtil.findChildOfType(ktFile, PsiErrorElement.class);
        if (error != null) {
          int line = text.substring(0, Math.min(error.getTextOffset(), text.length())).split("\n", -1).length;
          System.err.println(
              relative + ":" + line + ": " + error.getErrorDescription() + ". The sources compile, so the pinned"
                  + " Kotlin compiler " + System.getProperty("nitpicker.kotlinCompiler", "(unknown)")
                  + " is too old to read them: bump kotlinCompiler in nitpicker.init.gradle.");
          System.exit(1);
        }
        new Collector(ktFile, text, relative, entries).collect();
        fileEntries.add(describe(ktFile, relative, claimedFacades));
      }
    } finally {
      Disposer.dispose(disposable);
    }
    Files.writeString(
        output,
        "{\"functions\":[" + String.join(",", entries) + "],\"files\":[" + String.join(",", fileEntries) + "]}\n",
        StandardCharsets.UTF_8);
  }

  private static String describe(KtFile file, String relative, Set<String> claimedFacades) {
    String packageName = file.getPackageFqName().asString();
    String prefix = packageName.isEmpty() ? "" : packageName + ".";
    List<String> classes = new ArrayList<>();
    boolean facade = false;
    for (KtDeclaration declaration : file.getDeclarations()) {
      if (declaration instanceof KtClassOrObject) {
        String name = ((KtClassOrObject) declaration).getName();
        if (name != null) {
          classes.add(prefix + name);
        }
      } else if (declaration instanceof KtNamedFunction || declaration instanceof KtProperty) {
        facade = true;
      }
    }
    if (facade) {
      String facadeName = jvmName(file);
      if (facadeName == null) {
        facadeName = facadeOf(file.getName());
      }
      if (multifile(file)) {
        classes.add(prefix + facadeName + "__" + facadeOf(file.getName()));
      }
      if (!multifile(file) || claimedFacades.add(prefix + facadeName)) {
        classes.add(prefix + facadeName);
      }
    }
    return "{\"file\":" + MetricsSupport.quote(relative) + ",\"package\":" + MetricsSupport.quote(packageName) + ",\"classes\":["
        + classes.stream().map(MetricsSupport::quote).collect(Collectors.joining(",")) + "]}";
  }

  private static boolean multifile(KtFile file) {
    return file.getAnnotationEntries().stream()
        .anyMatch(
            entry ->
                entry.getShortName() != null && "JvmMultifileClass".equals(entry.getShortName().asString()));
  }

  private static String jvmName(KtFile file) {
    for (KtAnnotationEntry entry : file.getAnnotationEntries()) {
      if ("JvmName".equals(entry.getShortName() == null ? null : entry.getShortName().asString())
          && !entry.getValueArguments().isEmpty()) {
        String argument = entry.getValueArguments().get(0).getArgumentExpression().getText();
        return argument.replace("\"", "");
      }
    }
    return null;
  }

  private static String facadeOf(String fileName) {
    String base = fileName.endsWith(".kt") ? fileName.substring(0, fileName.length() - 3) : fileName;
    StringBuilder name = new StringBuilder();
    for (int i = 0; i < base.length(); i++) {
      char c = base.charAt(i);
      name.append(Character.isJavaIdentifierPart(c) ? c : '_');
    }
    if (name.length() > 0) {
      name.setCharAt(0, Character.toUpperCase(name.charAt(0)));
    }
    return name + "Kt";
  }

  /** Walks the declarations and reports each unit with the name of its enclosing classes. */
  private static final class Collector {
    private final KtFile file;
    private final String relative;
    private final List<String> entries;
    private final int[] lineStarts;

    Collector(KtFile file, String text, String relative, List<String> entries) {
      this.file = file;
      this.relative = relative;
      this.entries = entries;
      List<Integer> starts = new ArrayList<>(List.of(0));
      for (int i = 0; i < text.length(); i++) {
        if (text.charAt(i) == '\n') {
          starts.add(i + 1);
        }
      }
      this.lineStarts = starts.stream().mapToInt(Integer::intValue).toArray();
    }

    void collect() {
      for (KtDeclaration declaration : file.getDeclarations()) {
        declare(declaration, "");
      }
    }

    private void declare(KtDeclaration declaration, String owner) {
      if (declaration instanceof KtClassOrObject) {
        klass((KtClassOrObject) declaration, owner);
      } else if (declaration instanceof KtNamedFunction) {
        KtNamedFunction function = (KtNamedFunction) declaration;
        if (function.hasBody()) {
          KtTypeReference receiver = function.getReceiverTypeReference();
          String name = (receiver == null ? "" : receiver.getText() + ".") + function.getName();
          report(function, join(owner, name), function.getBodyExpression());
          nested(function.getBodyExpression(), owner, join(owner, name), inline(function));
          defaults(function, owner, join(owner, name));
        }
      } else if (declaration instanceof KtSecondaryConstructor) {
        KtSecondaryConstructor constructor = (KtSecondaryConstructor) declaration;
        if (constructor.getBodyExpression() instanceof KtBlockExpression) {
          String className = owner.substring(owner.lastIndexOf('.') + 1);
          report(constructor, join(owner, className), constructor.getBodyExpression());
          nested(constructor.getBodyExpression(), owner, join(owner, className), false);
          defaults(constructor, owner, join(owner, className));
        }
      } else if (declaration instanceof KtProperty) {
        property((KtProperty) declaration, owner);
      }
    }

    private void defaults(KtDeclarationWithBody declaration, String owner, String scope) {
      for (KtParameter parameter : declaration.getValueParameters()) {
        nested(parameter.getDefaultValue(), owner, scope, false);
      }
    }

    private void initializer(KtClassInitializer initializer, String owner) {
      KtExpression body = initializer.getBody();
      if (body instanceof KtBlockExpression && !((KtBlockExpression) body).getStatements().isEmpty()) {
        report(initializer, join(owner, "<init>"), body, 0, false, true);
      }
      nested(body, owner, join(owner, "<init>"), false);
    }

    private void property(KtProperty property, String owner) {
      for (KtPropertyAccessor accessor : property.getAccessors()) {
        if (accessor.hasBody()) {
          String kind = accessor.isGetter() ? "get" : "set";
          String name = join(owner, property.getName() + "." + kind);
          report(accessor, name, accessor.getBodyExpression());
          nested(accessor.getBodyExpression(), owner, name, inline(accessor));
        }
      }
      String name = join(owner, property.getName());
      KtFunction unit = unitOf(property);
      if (unit != null && unit.getBodyExpression() != null) {
        report(property, name, unit.getBodyExpression(), unit.getValueParameters().size(), false, false, true);
      } else if (unit == null && property.getInitializer() != null && measuredInitializer(property.getInitializer())) {
        report(property, name, property.getInitializer(), 0, false, true);
      }
      nested(property.getInitializer(), owner, name, unit, false);
      nested(property.getDelegateExpression(), owner, name, unit, false);
    }

    private static boolean measuredInitializer(KtExpression initializer) {
      Body metrics = new Body();
      metrics.visit(initializer, 0);
      return metrics.complexity > 1 || metrics.maxNesting > 0 || metrics.blocks > 0;
    }

    private static KtFunction unitOf(KtProperty property) {
      KtExpression initializer =
          property.getInitializer() == null ? null : KtPsiUtil.safeDeparenthesize(property.getInitializer());
      if (initializer instanceof KtLambdaExpression) {
        return ((KtLambdaExpression) initializer).getFunctionLiteral();
      }
      if (initializer instanceof KtNamedFunction && ((KtNamedFunction) initializer).getName() == null) {
        return (KtNamedFunction) initializer;
      }
      if (initializer != null && measuredInitializer(initializer)) {
        return null;
      }
      return lambdaArgument(initializer == null ? property.getDelegateExpression() : initializer);
    }

    private static KtFunction lambdaArgument(KtExpression holder) {
      KtExpression call = holder;
      if (call instanceof KtQualifiedExpression) {
        call = ((KtQualifiedExpression) call).getSelectorExpression();
      }
      if (!(call instanceof KtCallExpression)) {
        return null;
      }
      KtLambdaExpression lambda = null;
      for (KtValueArgument argument : ((KtCallExpression) call).getValueArguments()) {
        KtExpression expression = argument.getArgumentExpression();
        lambda = expression instanceof KtLambdaExpression ? (KtLambdaExpression) expression : lambda;
      }
      return lambda == null ? null : lambda.getFunctionLiteral();
    }

    private void klass(KtClassOrObject klass, String owner) {
      String simple = klass.getName();
      if (simple == null) {
        simple = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion()
            ? "Companion" : "<anonymous>";
      }
      String qualified = join(owner, simple);
      for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
        nested(entry, qualified, qualified, false);
      }
      for (KtDeclaration member : klass.getDeclarations()) {
        if (member instanceof KtClassInitializer) {
          initializer((KtClassInitializer) member, qualified);
        } else {
          declare(member, qualified);
        }
      }
      for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
        nested(parameter.getDefaultValue(), qualified, qualified, false);
      }
    }

    private void nested(PsiElement root, String owner, String scope, boolean inline) {
      nested(root, owner, scope, null, inline);
    }

    private void nested(PsiElement root, String owner, String scope, KtFunction held, boolean inline) {
      if (root == null) {
        return;
      }
      if (root instanceof KtClassOrObject) {
        klass((KtClassOrObject) root, owner);
      } else if (root instanceof KtLambdaExpression) {
        lambda((KtLambdaExpression) root, owner, scope, held, inline);
      } else if (root instanceof KtNamedFunction) {
        localFunction((KtNamedFunction) root, owner, scope, held, inline);
      } else if (root instanceof KtProperty && ((KtProperty) root).isLocal()) {
        localProperty((KtProperty) root, owner, scope, inline);
      } else {
        for (PsiElement child : root.getChildren()) {
          nested(child, owner, scope, held, inline);
        }
      }
    }

    private void lambda(KtLambdaExpression lambda, String owner, String scope, KtFunction held, boolean inline) {
      KtFunctionLiteral literal = lambda.getFunctionLiteral();
      String name = literal == held ? scope : join(scope, "<lambda>");
      if (literal != held && literal.getBodyExpression() != null) {
        report(lambda, name, literal.getBodyExpression(), literal.getValueParameters().size(), inline, false, true);
      }
      nested(literal.getBodyExpression(), owner, name, inline);
    }

    private void localFunction(KtNamedFunction function, String owner, String scope, KtFunction held, boolean inline) {
      if (function.getBodyExpression() == null) {
        return;
      }
      String name =
          function == held ? scope : join(scope, function.getName() == null ? "<lambda>" : function.getName());
      if (function != held) {
        report(function, name, function.getBodyExpression(), function.getValueParameters().size(), inline, false, true);
      }
      nested(function.getBodyExpression(), owner, name, inline);
    }

    private void localProperty(KtProperty property, String owner, String scope, boolean inline) {
      String name = join(scope, property.getName());
      KtFunction unit = unitOf(property);
      if (unit != null && unit.getBodyExpression() != null) {
        report(property, name, unit.getBodyExpression(), unit.getValueParameters().size(), inline, false, true);
      }
      nested(property.getInitializer(), owner, name, unit, inline);
      nested(property.getDelegateExpression(), owner, name, unit, inline);
    }

    private static String join(String owner, String name) {
      return owner.isEmpty() ? name : owner + "." + name;
    }

    private void report(KtDeclarationWithBody declaration, String name, KtExpression body) {
      report(declaration, name, body, declaration.getValueParameters().size(), inline(declaration));
    }

    private void report(PsiElement declaration, String name, KtExpression body, int parameters, boolean inline) {
      report(declaration, name, body, parameters, inline, false);
    }

    private void report(
        PsiElement declaration, String name, KtExpression body, int parameters, boolean inline, boolean initializer) {
      report(declaration, name, body, parameters, inline, initializer, false);
    }

    private void report(
        PsiElement declaration,
        String name,
        KtExpression body,
        int parameters,
        boolean inline,
        boolean initializer,
        boolean lambda) {
      int start = significant(declaration.getNode(), true);
      int end = significant(declaration.getNode(), false);
      int startLine = lineOf(start);
      int endLine = lineOf(Math.max(start, end - 1));
      Body metrics = new Body();
      boolean block = body instanceof KtBlockExpression;
      if (!block) {
        metrics.statements += 1;
      }
      metrics.visit(body, 0);
      entries.add(
          "{\"file\":" + MetricsSupport.quote(relative)
              + ",\"name\":" + MetricsSupport.quote(name)
              + ",\"start\":" + (startLine + 1)
              + ",\"end\":" + (endLine + 1)
              + ",\"lines\":" + (endLine - startLine + 1)
              + ",\"statements\":" + metrics.statements
              + ",\"maxControlNesting\":" + metrics.maxNesting
              + ",\"parameters\":" + parameters
              + ",\"complexity\":" + metrics.complexity
              + ",\"inline\":" + inline
              + ",\"initializer\":" + initializer
              + ",\"lambda\":" + lambda
              + "}");
    }

    private static boolean inline(KtDeclarationWithBody declaration) {
      PsiElement owner = declaration instanceof KtPropertyAccessor ? declaration.getParent() : declaration;
      return declaration.hasModifier(KtTokens.INLINE_KEYWORD)
          || (owner instanceof KtModifierListOwner
              && ((KtModifierListOwner) owner).hasModifier(KtTokens.INLINE_KEYWORD));
    }

    private int lineOf(int offset) {
      int index = Arrays.binarySearch(lineStarts, offset);
      return index >= 0 ? index : -index - 2;
    }

    /** First or last offset of a declaration that is not whitespace, a comment or KDoc. */
    private static int significant(ASTNode node, boolean first) {
      ASTNode current = first ? node.getFirstChildNode() : node.getLastChildNode();
      while (current != null
          && (KtTokens.WHITESPACES.contains(current.getElementType())
              || KtTokens.COMMENTS.contains(current.getElementType()))) {
        current = first ? current.getTreeNext() : current.getTreePrev();
      }
      return first
          ? (current == null ? node.getStartOffset() : current.getStartOffset())
          : (current == null ? node.getTextRange().getEndOffset() : current.getTextRange().getEndOffset());
    }
  }

  /** Statement count, control nesting and complexity of one body; nested classes, lambdas and local functions are not entered. */
  private static final class Body {
    int statements = 0;
    int maxNesting = 0;
    int complexity = 1;
    int blocks = 0;

    void visit(PsiElement element, int depth) {
      if (element == null
          || element instanceof KtClassOrObject
          || element instanceof KtLambdaExpression
          || element instanceof KtNamedFunction) {
        return;
      }
      int next = isControl(element) && !isElseIf(element) ? depth + 1 : depth;
      maxNesting = Math.max(maxNesting, next);
      count(element);
      for (PsiElement child : element.getChildren()) {
        visit(child, next);
      }
    }

    private void count(PsiElement element) {
      if (element instanceof KtBlockExpression) {
        blocks += 1;
        statements += ((KtBlockExpression) element).getStatements().size();
      } else if (element instanceof KtIfExpression) {
        KtIfExpression expression = (KtIfExpression) element;
        complexity += 1;
        unbraced(expression, expression.getThen());
        unbraced(expression, expression.getElse());
      } else if (element instanceof KtLoopExpression) {
        complexity += 1;
        unbraced(element, ((KtLoopExpression) element).getBody());
      } else if (element instanceof KtWhenEntry) {
        KtWhenEntry entry = (KtWhenEntry) element;
        complexity += entry.isElse() ? 0 : 1;
        unbraced(element.getParent(), entry.getExpression());
      } else if (element instanceof KtCatchClause) {
        complexity += 1;
      } else if (element instanceof KtBinaryExpression) {
        Object token = ((KtBinaryExpression) element).getOperationToken();
        complexity += token == KtTokens.ANDAND || token == KtTokens.OROR || token == KtTokens.ELVIS ? 1 : 0;
      }
    }

    /** A branch without braces is a statement of its own when the construct is a statement. */
    private void unbraced(PsiElement construct, KtExpression branch) {
      if (branch != null && !(branch instanceof KtBlockExpression) && statement(construct)) {
        statements += 1;
      }
    }

    private static boolean statement(PsiElement construct) {
      PsiElement parent = construct.getParent();
      return parent instanceof KtBlockExpression || parent instanceof KtContainerNodeForControlStructureBody
          || parent instanceof KtWhenEntry;
    }
  }

  private static boolean isElseIf(PsiElement element) {
    PsiElement container = element.getParent();
    return element instanceof KtIfExpression
        && container instanceof KtContainerNodeForControlStructureBody
        && container.getParent() instanceof KtIfExpression
        && ((KtIfExpression) container.getParent()).getElse() == element;
  }

  private static boolean isControl(PsiElement element) {
    return element instanceof KtIfExpression
        || element instanceof KtLoopExpression
        || element instanceof KtWhenExpression
        || element instanceof KtCatchClause;
  }
}
