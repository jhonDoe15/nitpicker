// Per-function metrics and class names of the Kotlin sources, for the Kotlin preset
// (languages/java/gradle/nitpicker.init.gradle, task nitpickerKotlinMetrics). Run in the JDK's
// single-file source mode with the Kotlin compiler on the class path, which parses (never
// compiles) the sources with the compiler's own PSI parser:
//
//   java -cp <kotlin-compiler-embeddable and dependencies> KotlinMetrics.java <output.json> <projectDir> <sourceRoot>...
//
// Output: {"functions": [...], "files": [...]}. Every function with a body is one entry:
//   lines              last line - first line + 1 (annotations and modifiers included, KDoc and comments not)
//   statements         every element of a block, plus the unbraced body of an if, else, loop or when branch
//                      that is itself a statement, plus 1 for an expression body
//   maxControlNesting  deepest nesting of if, for, while, do, when and catch; an else if nests like in Java
//   parameters         declared value parameters (the extension receiver is not one)
//   complexity         cyclomatic complexity: 1 + if, for, while, do, each when branch but else, catch,
//                      &&, || and ?: (the CRAP input; what lizard counts for Java)
//   inline             true for an inline function or accessor: its body is copied into the callers, so
//                      JaCoCo never sees it run and its coverage (hence its CRAP score) cannot be measured
// A unit is a named function, a property accessor with a body or a secondary constructor with a block body. Members of
// nested, local and anonymous classes and objects are units of their own and do not count towards the
// enclosing function; lambdas and local functions count towards it.
// Files under build, generated, target and out directories are skipped, as jscpd ignores them.
// Every file also lists the JVM names of its top-level classes and, when it declares top-level
// functions or properties, of its file facade (the coupling step maps classes back to files with it).

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
import org.jetbrains.kotlin.com.intellij.psi.PsiFileFactory;
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
    List<Path> files = new ArrayList<>();
    for (int i = 2; i < args.length; i++) {
      Path root = projectDir.resolve(args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(".kt") && !generated(projectDir, p))
              .sorted()
              .forEach(files::add);
        }
      }
    }
    List<String> entries = new ArrayList<>();
    List<String> fileEntries = new ArrayList<>();
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
        String relative =
            projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
        String text =
            Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n');
        KtFile ktFile =
            (KtFile)
                factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
        new Collector(ktFile, text, relative, entries).collect();
        fileEntries.add(describe(ktFile, relative));
      }
    } finally {
      Disposer.dispose(disposable);
    }
    Files.writeString(
        output,
        "{\"functions\":[" + String.join(",", entries) + "],\"files\":[" + String.join(",", fileEntries) + "]}\n",
        StandardCharsets.UTF_8);
  }

  /** Files under build, generated, target or out directories, as jscpd ignores them. */
  private static boolean generated(Path projectDir, Path file) {
    String relative = "/" + projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
    return Stream.of("/build/", "/generated/", "/target/", "/out/").anyMatch(relative::contains);
  }

  private static String describe(KtFile file, String relative) {
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
      classes.add(prefix + facadeName);
    }
    return "{\"file\":" + quote(relative) + ",\"classes\":["
        + classes.stream().map(KotlinMetrics::quote).collect(Collectors.joining(",")) + "]}";
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
          nestedClasses(function.getBodyExpression(), owner);
        }
      } else if (declaration instanceof KtSecondaryConstructor) {
        KtSecondaryConstructor constructor = (KtSecondaryConstructor) declaration;
        if (constructor.getBodyExpression() instanceof KtBlockExpression) {
          String className = owner.substring(owner.lastIndexOf('.') + 1);
          report(constructor, join(owner, className), constructor.getBodyExpression());
          nestedClasses(constructor.getBodyExpression(), owner);
        }
      } else if (declaration instanceof KtProperty) {
        property((KtProperty) declaration, owner);
      } else if (declaration instanceof KtClassInitializer) {
        nestedClasses(((KtClassInitializer) declaration).getBody(), owner);
      }
    }

    private void property(KtProperty property, String owner) {
      for (KtPropertyAccessor accessor : property.getAccessors()) {
        if (accessor.hasBody()) {
          String kind = accessor.isGetter() ? "get" : "set";
          report(accessor, join(owner, property.getName() + "." + kind), accessor.getBodyExpression());
          nestedClasses(accessor.getBodyExpression(), owner);
        }
      }
      nestedClasses(property.getInitializer(), owner);
      nestedClasses(property.getDelegateExpression(), owner);
    }

    private void klass(KtClassOrObject klass, String owner) {
      String simple = klass.getName();
      if (simple == null) {
        simple = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion()
            ? "Companion" : "<anonymous>";
      }
      String qualified = join(owner, simple);
      for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
        nestedClasses(entry, qualified);
      }
      for (KtDeclaration member : klass.getDeclarations()) {
        declare(member, qualified);
      }
      for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
        nestedClasses(parameter.getDefaultValue(), qualified);
      }
    }

    private void nestedClasses(PsiElement root, String owner) {
      if (root == null) {
        return;
      }
      if (root instanceof KtClassOrObject) {
        klass((KtClassOrObject) root, owner);
        return;
      }
      for (PsiElement child : root.getChildren()) {
        nestedClasses(child, owner);
      }
    }

    private static String join(String owner, String name) {
      return owner.isEmpty() ? name : owner + "." + name;
    }

    private void report(KtDeclarationWithBody declaration, String name, KtExpression body) {
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
          "{\"file\":" + quote(relative)
              + ",\"name\":" + quote(name)
              + ",\"start\":" + (startLine + 1)
              + ",\"end\":" + (endLine + 1)
              + ",\"lines\":" + (endLine - startLine + 1)
              + ",\"statements\":" + metrics.statements
              + ",\"maxControlNesting\":" + metrics.maxNesting
              + ",\"parameters\":" + declaration.getValueParameters().size()
              + ",\"complexity\":" + metrics.complexity
              + ",\"inline\":" + inline(declaration)
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

  /** Statement count, control nesting and complexity of one body; nested classes are not entered. */
  private static final class Body {
    int statements = 0;
    int maxNesting = 0;
    int complexity = 1;

    void visit(PsiElement element, int depth) {
      if (element == null || element instanceof KtClassOrObject) {
        return;
      }
      int next = isControl(element) ? depth + 1 : depth;
      maxNesting = Math.max(maxNesting, next);
      count(element);
      for (PsiElement child : element.getChildren()) {
        visit(child, next);
      }
    }

    private void count(PsiElement element) {
      if (element instanceof KtBlockExpression) {
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

  private static boolean isControl(PsiElement element) {
    return element instanceof KtIfExpression
        || element instanceof KtLoopExpression
        || element instanceof KtWhenExpression
        || element instanceof KtCatchClause;
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
