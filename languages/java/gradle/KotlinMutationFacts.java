// Source facts for the Kotlin mutation filter, for the Kotlin preset
// (languages/java/gradle/nitpicker.init.gradle, task nitpickerKotlinMutationFacts). Run in the JDK's
// single-file source mode with the Kotlin compiler on the class path, which parses (never compiles)
// the sources with the compiler's PSI parser:
//
//   java -cp <kotlin-compiler-embeddable and dependencies> KotlinMutationFacts.java <output.json> <projectDir> <sourceRoot>...
//
// The facts tell the Nitpicker side which mutants of PIT's report hit code that the compiler wrote.
// Output: {"files": [...]}, one entry per source file (lines are 1-based):
//   file, package, lines   path from the project directory, package, number of lines
//   classes                every named class, object and interface (nested ones with $ in the JVM name), plus the
//                          file facade when the file has top-level functions or properties:
//                          name, kind (class, data, value, enum, interface, object, annotation, facade),
//                          start and headerEnd (the lines of the declaration up to its body), init (it has an
//                          init block), serializable (it carries @Serializable), functions (names written in its
//                          body), properties: name, start, end, constructor, getter and setter (written with a
//                          body), delegated
//   functions              every named function with a body: name, class, start, end, suspend, inline,
//                          returnsUnit (a block body or a declared Unit result), inlineCalls (names of the
//                          project's inline functions it calls), staticIn (the class that gets the static
//                          bridge of a @JvmStatic function of a companion object)
//   lambdas                every lambda: start, end, valueLines (first and last line of the expression whose
//                          value it returns, none when its last statement is not an expression), returnLines
//                          (the lines of its labeled returns), callee (the call it is an argument of),
//                          discarded (the call is a statement whose value nobody reads), unitCallee (the
//                          project function it is passed to takes a lambda that returns Unit)
//   branching              lines that hold syntax the compiler turns into a conditional: if, when, loops, && and
//                          ||, ?: and ?., comparisons, ==, !, !!, is, in, as, and a call of an inline function
//                          that loops or branches (the standard library's and the project's own)
//   bang                   first and last line of each expression that holds !!
// A syntax error ends the run: the sources compiled, so the Kotlin of the project is newer than the pinned compiler.

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

public final class KotlinMutationFacts {
  private static final Set<String> INLINE_BRANCHING =
      Set.of(
          "map", "mapNotNull", "mapIndexed", "mapIndexedNotNull", "filter", "filterNot", "filterIndexed",
          "filterNotNull", "filterIsInstance", "forEach", "forEachIndexed", "onEach", "onEachIndexed", "any", "all",
          "none", "count", "find", "findLast", "first", "firstOrNull", "last", "lastOrNull", "single",
          "singleOrNull", "indexOfFirst", "indexOfLast", "sumOf", "sumBy", "fold", "foldIndexed", "reduce",
          "reduceOrNull", "flatMap", "flatMapIndexed", "associate", "associateBy", "associateWith", "groupBy",
          "partition", "takeWhile", "dropWhile", "repeat", "use", "require", "requireNotNull", "check",
          "checkNotNull", "assert", "getOrElse", "getOrPut", "takeIf", "takeUnless", "ifEmpty", "ifBlank",
          "coerceAtLeast", "coerceAtMost", "coerceIn", "maxOf", "minOf", "maxOfOrNull", "minOfOrNull", "maxByOrNull",
          "minByOrNull", "mapCatching", "recover", "getOrNull", "getOrDefault");
  private static final Set<Object> COMPARISONS =
      Set.of(KtTokens.LT, KtTokens.GT, KtTokens.LTEQ, KtTokens.GTEQ, KtTokens.EQEQ, KtTokens.EXCLEQ,
          KtTokens.EQEQEQ, KtTokens.EXCLEQEQEQ, KtTokens.ANDAND, KtTokens.OROR, KtTokens.ELVIS,
          KtTokens.IN_KEYWORD, KtTokens.NOT_IN);

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path projectDir = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = new ArrayList<>();
    for (int i = 2; i < args.length; i++) {
      Path root = projectDir.resolve(args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(".kt")).sorted().forEach(files::add);
        }
      }
    }
    Disposable disposable = Disposer.newDisposable();
    List<Parsed> parsed = new ArrayList<>();
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
        parsed.add(parse(factory, projectDir, file));
      }
      Set<String> projectInline = new HashSet<>();
      Map<String, Boolean> unitCallees = new HashMap<>();
      for (Parsed unit : parsed) {
        for (KtNamedFunction function : PsiTreeUtil.findChildrenOfType(unit.file, KtNamedFunction.class)) {
          if (function.getName() == null) {
            continue;
          }
          if (function.hasModifier(KtTokens.INLINE_KEYWORD)) {
            projectInline.add(function.getName());
          }
          unitCallees.merge(function.getName(), takesUnitLambda(function), (a, b) -> a && b);
        }
      }
      Project project = new Project(projectInline, unitCallees);
      String body = parsed.stream().map(unit -> describe(unit, project)).collect(Collectors.joining(","));
      Files.writeString(output, "{\"files\":[" + body + "]}\n", StandardCharsets.UTF_8);
    } finally {
      Disposer.dispose(disposable);
    }
  }

  private record Project(Set<String> inline, Map<String, Boolean> unitCallees) {}

  private static boolean takesUnitLambda(KtNamedFunction function) {
    boolean any = false;
    for (KtParameter parameter : function.getValueParameters()) {
      KtTypeReference type = parameter.getTypeReference();
      KtTypeElement element = type == null ? null : type.getTypeElement();
      if (element instanceof KtFunctionType) {
        KtTypeReference result = ((KtFunctionType) element).getReturnTypeReference();
        if (result == null || !"Unit".equals(result.getText())) {
          return false;
        }
        any = true;
      }
    }
    return any;
  }

  private record Parsed(KtFile file, String relative, String text, int[] lineStarts) {}

  private static Parsed parse(PsiFileFactory factory, Path projectDir, Path file) throws IOException {
    String relative = projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
    String text = Files.readString(file, StandardCharsets.UTF_8);
    if (text.startsWith("﻿")) {
      text = text.substring(1);
    }
    text = text.replace("\r\n", "\n").replace('\r', '\n');
    KtFile ktFile =
        (KtFile) factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
    PsiErrorElement error = PsiTreeUtil.findChildOfType(ktFile, PsiErrorElement.class);
    if (error != null) {
      int line = text.substring(0, Math.min(error.getTextOffset(), text.length())).split("\n", -1).length;
      System.err.println(
          relative + ":" + line + ": " + error.getErrorDescription() + ". The sources compile, so Nitpicker's"
              + " Kotlin compiler " + System.getProperty("nitpicker.kotlinCompiler", "(unknown)")
              + " is older than the Kotlin of this project: upgrade Nitpicker.");
      System.exit(1);
    }
    List<Integer> starts = new ArrayList<>(List.of(0));
    for (int i = 0; i < text.length(); i++) {
      if (text.charAt(i) == '\n') {
        starts.add(i + 1);
      }
    }
    return new Parsed(ktFile, relative, text, starts.stream().mapToInt(Integer::intValue).toArray());
  }

  private static String describe(Parsed unit, Project project) {
    Facts facts = new Facts(unit, project);
    return "{\"file\":" + quote(unit.relative) + ",\"package\":" + quote(unit.file.getPackageFqName().asString())
        + ",\"lines\":" + unit.lineStarts.length
        + ",\"classes\":[" + String.join(",", facts.classes) + "]"
        + ",\"functions\":[" + String.join(",", facts.functions) + "]"
        + ",\"lambdas\":[" + String.join(",", facts.lambdas) + "]"
        + ",\"branching\":" + facts.branching.stream().sorted().collect(Collectors.toList())
        + ",\"bang\":" + facts.bang.stream().sorted().collect(Collectors.toList()) + "}";
  }

  private static final class Facts {
    final Parsed unit;
    final Project project;
    final List<String> classes = new ArrayList<>();
    final List<String> functions = new ArrayList<>();
    final List<String> lambdas = new ArrayList<>();
    final Set<Integer> branching = new HashSet<>();
    final Set<Integer> bang = new HashSet<>();

    Facts(Parsed unit, Project project) {
      this.unit = unit;
      this.project = project;
      String prefix = unit.file.getPackageFqName().isRoot() ? "" : unit.file.getPackageFqName().asString() + ".";
      List<KtDeclaration> topLevel = new ArrayList<>();
      for (KtDeclaration declaration : unit.file.getDeclarations()) {
        if (declaration instanceof KtClassOrObject) {
          declareClass((KtClassOrObject) declaration, prefix);
        } else {
          topLevel.add(declaration);
        }
      }
      if (!topLevel.isEmpty()) {
        facade(topLevel, prefix);
      }
      scan(unit.file);
    }

    private void facade(List<KtDeclaration> declarations, String prefix) {
      String name = prefix + facadeName();
      classes.add(classEntry(name, "facade", 0, 0, false, false, declarations));
      for (KtDeclaration declaration : declarations) {
        if (declaration instanceof KtNamedFunction) {
          declareFunction((KtNamedFunction) declaration, name, null);
        }
      }
    }

    private String facadeName() {
      for (KtAnnotationEntry entry : unit.file.getAnnotationEntries()) {
        boolean jvmName = entry.getShortName() != null && "JvmName".equals(entry.getShortName().asString());
        if (jvmName && !entry.getValueArguments().isEmpty()) {
          return entry.getValueArguments().get(0).getArgumentExpression().getText().replace("\"", "");
        }
      }
      String base = unit.file.getName().endsWith(".kt")
          ? unit.file.getName().substring(0, unit.file.getName().length() - 3) : unit.file.getName();
      StringBuilder name = new StringBuilder();
      for (char c : base.toCharArray()) {
        name.append(Character.isJavaIdentifierPart(c) ? c : '_');
      }
      name.setCharAt(0, Character.toUpperCase(name.charAt(0)));
      return name + "Kt";
    }

    private void declareClass(KtClassOrObject klass, String prefix) {
      String simple = klass.getName();
      if (simple == null && klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion()) {
        simple = "Companion";
      }
      KtClassBody body = klass.getBody();
      if (simple == null || (klass instanceof KtEnumEntry && body == null)) {
        return;
      }
      String name = prefix + simple;
      int start = lineOf(significant(klass.getNode(), true)) + 1;
      int headerEnd = body == null || body.getLBrace() == null
          ? lineOf(significant(klass.getNode(), false) - 1) : lineOf(body.getLBrace().getTextRange().getStartOffset());
      List<KtDeclaration> members = new ArrayList<>(klass.getDeclarations());
      boolean init = members.stream().anyMatch(m -> m instanceof KtClassInitializer);
      boolean serializable = klass.getAnnotationEntries().stream()
          .anyMatch(e -> e.getShortName() != null && "Serializable".equals(e.getShortName().asString()));
      List<KtDeclaration> all = new ArrayList<>(members);
      all.addAll(klass.getPrimaryConstructorParameters().stream()
          .filter(p -> p.hasValOrVar()).collect(Collectors.toList()));
      classes.add(classEntry(name, kind(klass), start, headerEnd + 1, init, serializable, all));
      for (KtDeclaration member : members) {
        if (member instanceof KtClassOrObject) {
          declareClass((KtClassOrObject) member, name + "$");
        } else if (member instanceof KtNamedFunction) {
          declareFunction((KtNamedFunction) member, name, staticOwner(klass, prefix));
        }
      }
    }

    private String staticOwner(KtClassOrObject klass, String prefix) {
      boolean companion = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion();
      return companion && prefix.endsWith("$") ? prefix.substring(0, prefix.length() - 1) : null;
    }

    private String kind(KtClassOrObject klass) {
      if (klass instanceof KtObjectDeclaration) {
        return "object";
      }
      KtClass ktClass = (KtClass) klass;
      if (ktClass.isData()) {
        return "data";
      }
      if (ktClass.hasModifier(KtTokens.VALUE_KEYWORD) || ktClass.hasModifier(KtTokens.INLINE_KEYWORD)) {
        return "value";
      }
      if (ktClass.isEnum()) {
        return "enum";
      }
      if (ktClass.isInterface()) {
        return "interface";
      }
      return ktClass.isAnnotation() ? "annotation" : "class";
    }

    private String classEntry(
        String name, String kind, int start, int headerEnd, boolean init, boolean serializable,
        List<KtDeclaration> members) {
      List<String> functionNames = new ArrayList<>();
      List<String> properties = new ArrayList<>();
      for (KtDeclaration member : members) {
        if (member instanceof KtNamedFunction && member.getName() != null) {
          functionNames.add(quote(member.getName()));
        } else if (member instanceof KtProperty) {
          properties.add(property((KtProperty) member));
        } else if (member instanceof KtParameter) {
          properties.add(constructorProperty((KtParameter) member));
        }
      }
      return "{\"name\":" + quote(name) + ",\"kind\":" + quote(kind) + ",\"start\":" + start
          + ",\"headerEnd\":" + headerEnd + ",\"init\":" + init + ",\"serializable\":" + serializable
          + ",\"functions\":[" + String.join(",", functionNames) + "],\"properties\":["
          + String.join(",", properties) + "]}";
    }

    private String property(KtProperty property) {
      KtPropertyAccessor getter = property.getGetter();
      KtPropertyAccessor setter = property.getSetter();
      return propertyEntry(property, property.getName(), false,
          getter != null && getter.hasBody(), setter != null && setter.hasBody(), property.hasDelegate());
    }

    private String constructorProperty(KtParameter parameter) {
      return propertyEntry(parameter, parameter.getName(), true, false, false, false);
    }

    private String propertyEntry(
        PsiElement element, String name, boolean constructor, boolean getter, boolean setter, boolean delegated) {
      int start = lineOf(significant(element.getNode(), true)) + 1;
      int end = lineOf(Math.max(significant(element.getNode(), true), significant(element.getNode(), false) - 1)) + 1;
      return "{\"name\":" + quote(String.valueOf(name)) + ",\"start\":" + start + ",\"end\":" + end
          + ",\"constructor\":" + constructor + ",\"getter\":" + getter + ",\"setter\":" + setter
          + ",\"delegated\":" + delegated + "}";
    }

    private void declareFunction(KtNamedFunction function, String owner, String staticOwner) {
      if (!function.hasBody() || function.getName() == null) {
        return;
      }
      int start = lineOf(significant(function.getNode(), true)) + 1;
      int end = lineOf(Math.max(0, significant(function.getNode(), false) - 1)) + 1;
      boolean jvmStatic = function.getAnnotationEntries().stream()
          .anyMatch(e -> e.getShortName() != null && "JvmStatic".equals(e.getShortName().asString()));
      functions.add("{\"name\":" + quote(function.getName()) + ",\"class\":" + quote(owner)
          + ",\"start\":" + start + ",\"end\":" + end
          + ",\"suspend\":" + function.hasModifier(KtTokens.SUSPEND_KEYWORD)
          + ",\"inline\":" + function.hasModifier(KtTokens.INLINE_KEYWORD)
          + ",\"returnsUnit\":" + returnsUnit(function)
          + ",\"inlineCalls\":" + inlineCalls(function)
          + ",\"staticIn\":" + (jvmStatic && staticOwner != null ? quote(staticOwner) : "null") + "}");
    }

    private boolean returnsUnit(KtNamedFunction function) {
      KtTypeReference type = function.getTypeReference();
      return type == null ? function.hasBlockBody() : "Unit".equals(type.getText());
    }

    private String inlineCalls(KtNamedFunction function) {
      Set<String> names = new TreeSet<>();
      for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(function, KtCallExpression.class)) {
        KtExpression callee = call.getCalleeExpression();
        if (callee != null && project.inline().contains(callee.getText())) {
          names.add(quote(callee.getText()));
        }
      }
      return "[" + String.join(",", names) + "]";
    }

    private void scan(PsiElement element) {
      markBranching(element);
      if (element instanceof KtLambdaExpression) {
        lambda((KtLambdaExpression) element);
      }
      for (PsiElement child : element.getChildren()) {
        scan(child);
      }
    }

    private void markBranching(PsiElement element) {
      if (element instanceof KtIfExpression) {
        mark(((KtIfExpression) element).getIfKeyword());
        markEnds(((KtIfExpression) element).getCondition());
      } else if (element instanceof KtWhenExpression) {
        KtWhenExpression when = (KtWhenExpression) element;
        mark(when.getWhenKeyword());
        markEnds(when.getSubjectExpression());
        when.getEntries().forEach(entry -> Arrays.stream(entry.getConditions()).forEach(this::markEnds));
        when.getEntries().stream().filter(KtWhenEntry::isElse).forEach(entry -> mark(entry.getElseKeyword()));
      } else if (element instanceof KtLoopExpression) {
        mark(element.getFirstChild());
        markLoopHeader((KtLoopExpression) element);
      } else if (element instanceof KtBinaryExpression) {
        Object token = ((KtBinaryExpression) element).getOperationToken();
        if (COMPARISONS.contains(token)) {
          mark(((KtBinaryExpression) element).getOperationReference());
          markEnds(element);
        }
      } else if (element instanceof KtIsExpression) {
        mark(((KtIsExpression) element).getOperationReference());
      } else if (element instanceof KtBinaryExpressionWithTypeRHS) {
        mark(((KtBinaryExpressionWithTypeRHS) element).getOperationReference());
      } else if (element instanceof KtPrefixExpression
          && ((KtPrefixExpression) element).getOperationToken() == KtTokens.EXCL) {
        mark(((KtPrefixExpression) element).getOperationReference());
      } else if (element instanceof KtPostfixExpression
          && ((KtPostfixExpression) element).getOperationToken() == KtTokens.EXCLEXCL) {
        mark(((KtPostfixExpression) element).getOperationReference());
        bang.add(lineOf(element.getTextRange().getStartOffset()) + 1);
        bang.add(lineOf(element.getTextRange().getEndOffset() - 1) + 1);
      } else if (element instanceof KtSafeQualifiedExpression) {
        mark(((KtSafeQualifiedExpression) element).getOperationTokenNode().getPsi());
      } else if (element instanceof KtCallExpression) {
        markCall((KtCallExpression) element);
      }
    }

    private void markLoopHeader(KtLoopExpression loop) {
      if (loop instanceof KtForExpression) {
        markEnds(((KtForExpression) loop).getLoopRange());
        markEnds(((KtForExpression) loop).getLoopParameter());
      } else if (loop instanceof KtWhileExpressionBase) {
        markEnds(((KtWhileExpressionBase) loop).getCondition());
      }
    }

    private void markCall(KtCallExpression call) {
      KtExpression callee = call.getCalleeExpression();
      String name = callee == null ? null : callee.getText();
      if (name != null && (INLINE_BRANCHING.contains(name) || project.inline().contains(name))) {
        mark(callee);
      }
    }

    private void mark(PsiElement element) {
      if (element != null) {
        branching.add(lineOf(element.getTextRange().getStartOffset()) + 1);
      }
    }

    private void markEnds(PsiElement element) {
      if (element != null) {
        branching.add(lineOf(element.getTextRange().getStartOffset()) + 1);
        branching.add(lineOf(Math.max(element.getTextRange().getStartOffset(), element.getTextRange().getEndOffset() - 1)) + 1);
      }
    }

    private void lambda(KtLambdaExpression lambda) {
      KtFunctionLiteral literal = lambda.getFunctionLiteral();
      KtBlockExpression body = literal.getBodyExpression();
      List<KtExpression> statements = body == null ? List.of() : body.getStatements();
      KtExpression last = statements.isEmpty() ? null : statements.get(statements.size() - 1);
      boolean value = last != null && !(last instanceof KtDeclaration) && !(last instanceof KtLoopExpression)
          && !(last instanceof KtBinaryExpression && ((KtBinaryExpression) last).getOperationToken() == KtTokens.EQ);
      int start = lineOf(significant(lambda.getNode(), true)) + 1;
      int end = lineOf(Math.max(0, significant(lambda.getNode(), false) - 1)) + 1;
      lambdas.add("{\"start\":" + start + ",\"end\":" + end + ",\"valueLines\":"
          + (value ? "[" + (lineOf(last.getTextRange().getStartOffset()) + 1) + ","
              + (lineOf(Math.max(0, last.getTextRange().getEndOffset() - 1)) + 1) + "]" : "[]")
          + ",\"returnLines\":" + returnLines(lambda)
          + ",\"callee\":" + calleeOf(lambda)
          + ",\"discarded\":" + discarded(lambda)
          + ",\"unitCallee\":" + unitCallee(lambda) + "}");
    }

    private String returnLines(KtLambdaExpression lambda) {
      Set<Integer> lines = new TreeSet<>();
      for (KtReturnExpression expression : PsiTreeUtil.findChildrenOfType(lambda, KtReturnExpression.class)) {
        if (expression.getLabelQualifier() != null) {
          lines.add(lineOf(expression.getTextRange().getStartOffset()) + 1);
          lines.add(lineOf(Math.max(0, expression.getTextRange().getEndOffset() - 1)) + 1);
        }
      }
      return lines.toString();
    }

    private KtCallExpression callOf(KtLambdaExpression lambda) {
      PsiElement parent = lambda.getParent();
      if (parent instanceof KtLambdaArgument || parent instanceof KtValueArgument) {
        PsiElement call = parent.getParent();
        call = call instanceof KtValueArgumentList ? call.getParent() : call;
        return call instanceof KtCallExpression ? (KtCallExpression) call : null;
      }
      return null;
    }

    private boolean discarded(KtLambdaExpression lambda) {
      KtCallExpression call = callOf(lambda);
      if (call == null) {
        return false;
      }
      PsiElement expression = call;
      while (expression.getParent() instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) expression.getParent()).getSelectorExpression() == expression) {
        expression = expression.getParent();
      }
      PsiElement block = expression.getParent();
      if (!(block instanceof KtBlockExpression)) {
        return false;
      }
      List<KtExpression> statements = ((KtBlockExpression) block).getStatements();
      boolean lastOfLambda = block.getParent() instanceof KtFunctionLiteral
          && statements.get(statements.size() - 1) == expression;
      return !lastOfLambda;
    }

    private boolean unitCallee(KtLambdaExpression lambda) {
      KtCallExpression call = callOf(lambda);
      KtExpression callee = call == null ? null : call.getCalleeExpression();
      return callee != null && project.unitCallees().getOrDefault(callee.getText(), false);
    }

    private String calleeOf(KtLambdaExpression lambda) {
      KtCallExpression call = callOf(lambda);
      return call == null || call.getCalleeExpression() == null ? "null" : quote(call.getCalleeExpression().getText());
    }

    private int lineOf(int offset) {
      int index = Arrays.binarySearch(unit.lineStarts, offset);
      return index >= 0 ? index : -index - 2;
    }

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
