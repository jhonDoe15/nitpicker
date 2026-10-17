import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import org.jetbrains.kotlin.cli.FrontendConfigurationKeysKt;
import org.jetbrains.kotlin.cli.common.messages.MessageCollector;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.com.intellij.openapi.Disposable;
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiFileFactory;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar;
import org.jetbrains.kotlin.config.CommonConfigurationKeys;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.idea.KotlinLanguage;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class KotlinFacts {
  private static final String TEST_PREFIX = "test:";
  private static final int TEXT_LIMIT = 200;
  private static final int BODY_LIMIT = 1500;
  private static final Set<String> WAIT_NAMES =
      Set.of(
          "sleep", "parkNanos", "wait", "join", "delay", "continually", "after", "waitForTimeout",
          "until", "pollDelay", "during");
  private static final Set<String> COLLECTION_FACTORIES =
      Set.of("setOf", "listOf", "arrayOf", "hashSetOf", "linkedSetOf", "sortedSetOf", "enumSetOf", "of");

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path projectDir = Path.of(args[1]).toAbsolutePath().normalize();
    Map<Path, Boolean> files = new LinkedHashMap<>();
    for (int i = 2; i < args.length; i++) {
      boolean test = args[i].startsWith(TEST_PREFIX);
      Path root = projectDir.resolve(test ? args[i].substring(TEST_PREFIX.length()) : args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(".kt")).sorted().forEach(p -> files.putIfAbsent(p, test));
        }
      }
    }
    List<Object> entries = new ArrayList<>();
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
      for (Map.Entry<Path, Boolean> source : files.entrySet()) {
        entries.add(read(factory, projectDir, source.getKey(), source.getValue()));
      }
    } finally {
      Disposer.dispose(disposable);
    }
    Files.writeString(output, Json.of(m("files", entries)) + "\n", StandardCharsets.UTF_8);
  }

  private static Object read(PsiFileFactory factory, Path projectDir, Path file, boolean test)
      throws IOException {
    String relative =
        projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
    String text = Files.readString(file, StandardCharsets.UTF_8);
    text = (text.startsWith("﻿") ? text.substring(1) : text).replace("\r\n", "\n").replace('\r', '\n');
    KtFile ktFile =
        (KtFile) factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
    PsiErrorElement error = PsiTreeUtil.findChildOfType(ktFile, PsiErrorElement.class);
    if (error != null) {
      int line = text.substring(0, Math.min(error.getTextOffset(), text.length())).split("\n", -1).length;
      System.err.println(
          relative + ":" + line + ": " + error.getErrorDescription() + ". The sources compile, so the pinned"
              + " Kotlin compiler " + System.getProperty("nitpicker.kotlinCompiler", "(unknown)")
              + " is too old to read them: bump kotlinCompiler in nitpicker.init.gradle.");
      System.exit(1);
    }
    Collector collector = new Collector(ktFile, text, relative, test);
    collector.collect();
    return collector.result();
  }

  static Map<String, Object> m(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      map.put((String) pairs[i], pairs[i + 1]);
    }
    return map;
  }

  static String clip(String text, int limit) {
    String flat = text.replaceAll("\\s+", " ").trim();
    return flat.length() > limit ? flat.substring(0, limit) : flat;
  }

  static String clip(PsiElement element) {
    return element == null ? null : clip(element.getText(), TEXT_LIMIT);
  }

  static String nameOf(PsiElement element) {
    return element instanceof KtSimpleNameExpression
        ? ((KtSimpleNameExpression) element).getReferencedName()
        : null;
  }

  static List<String> annotationNames(KtAnnotated annotated) {
    List<String> names = new ArrayList<>();
    for (KtAnnotationEntry entry : annotated.getAnnotationEntries()) {
      if (entry.getShortName() != null) {
        names.add(entry.getShortName().asString());
      }
    }
    return names;
  }

  static List<Object> annotationTexts(KtAnnotated annotated) {
    List<Object> texts = new ArrayList<>();
    for (KtAnnotationEntry entry : annotated.getAnnotationEntries()) {
      if (entry.getShortName() != null) {
        texts.add(m("name", entry.getShortName().asString(), "text", clip(entry.getText(), 400)));
      }
    }
    return texts;
  }

  static final class Frame {
    final Frame parent;
    final Map<String, Object> data;

    Frame(Frame parent, Map<String, Object> data) {
      this.parent = parent;
      this.data = data;
    }

    Object kind() {
      return data.get("k");
    }

    Frame nearest(String kind) {
      for (Frame frame = this; frame != null; frame = frame.parent) {
        if (kind.equals(frame.kind())) {
          return frame;
        }
      }
      return null;
    }

    List<Object> chain() {
      List<Object> scopes = new ArrayList<>();
      for (Frame frame = this; frame != null; frame = frame.parent) {
        scopes.add(frame.data);
      }
      return scopes;
    }
  }

  static final class Collector {
    private final KtFile file;
    private final String relative;
    private final boolean test;
    private final int[] lineStarts;
    private final List<Object> classes = new ArrayList<>();
    private final List<Object> functions = new ArrayList<>();
    private final List<Object> properties = new ArrayList<>();
    private final List<Object> waits = new ArrayList<>();
    private final List<Object> predicates = new ArrayList<>();
    private final Set<String> calls = new LinkedHashSet<>();
    private final Set<String> references = new LinkedHashSet<>();

    Collector(KtFile file, String text, String relative, boolean test) {
      this.file = file;
      this.relative = relative;
      this.test = test;
      List<Integer> starts = new ArrayList<>(List.of(0));
      for (int i = 0; i < text.length(); i++) {
        if (text.charAt(i) == '\n') {
          starts.add(i + 1);
        }
      }
      this.lineStarts = starts.stream().mapToInt(Integer::intValue).toArray();
    }

    void collect() {
      walk(file, null);
    }

    Object result() {
      List<Object> imports = new ArrayList<>();
      for (KtImportDirective directive : file.getImportDirectives()) {
        if (directive.getImportPath() != null) {
          imports.add(
              m(
                  "path", directive.getImportPath().getFqName().asString(),
                  "alias", directive.getImportPath().getAlias() == null
                      ? null : directive.getImportPath().getAlias().asString(),
                  "all", directive.getImportPath().isAllUnder()));
        }
      }
      return m(
          "file", relative, "test", test, "package", file.getPackageFqName().asString(),
          "imports", imports, "classes", classes, "functions", functions, "properties", properties,
          "waits", waits, "predicates", predicates, "calls", new ArrayList<Object>(calls.stream().map(Json.Raw::new).toList()),
          "references", new ArrayList<Object>(references));
    }

    private int lineOf(int offset) {
      int index = Arrays.binarySearch(lineStarts, offset);
      return (index >= 0 ? index : -index - 2) + 1;
    }

    private void walk(PsiElement element, Frame frame) {
      if (element instanceof KtEnumEntry
          || (element instanceof KtObjectDeclaration && ((KtObjectDeclaration) element).isObjectLiteral())) {
        literal((KtClassOrObject) element, frame);
        return;
      }
      if (element instanceof KtClassOrObject) {
        declareClass((KtClassOrObject) element, frame);
        return;
      }
      Frame inner = frame;
      if (element instanceof KtNamedFunction) {
        inner = declareFunction((KtNamedFunction) element, frame);
      } else if (element instanceof KtSecondaryConstructor) {
        inner = declareConstructor((KtSecondaryConstructor) element, frame);
      } else if (element instanceof KtProperty) {
        declareProperty((KtProperty) element, frame);
      } else if (element instanceof KtPropertyAccessor) {
        inner = new Frame(frame, m("k", "fun", "name", ((KtPropertyAccessor) element).isGetter() ? "get" : "set"));
      } else if (element instanceof KtClassInitializer) {
        inner = new Frame(frame, m("k", "init"));
      } else if (element instanceof KtLambdaExpression) {
        inner = new Frame(frame, lambdaData((KtLambdaExpression) element));
      } else if (element instanceof KtLoopExpression) {
        inner = new Frame(frame, loopData((KtLoopExpression) element));
      } else if (element instanceof KtCallExpression) {
        call((KtCallExpression) element, frame);
      } else if (element instanceof KtSuperTypeCallEntry) {
        delegation(element, nameOf(((KtSuperTypeCallEntry) element).getCalleeExpression()),
            ((KtSuperTypeCallEntry) element).getValueArguments(), List.of());
      } else if (element instanceof KtConstructorDelegationCall) {
        constructorDelegation((KtConstructorDelegationCall) element, frame);
      } else if (element instanceof KtBinaryExpression) {
        binary((KtBinaryExpression) element, frame);
      } else if (element instanceof KtDotQualifiedExpression) {
        containsForm((KtDotQualifiedExpression) element, frame);
      } else if (element instanceof KtCallableReferenceExpression) {
        references.add(((KtCallableReferenceExpression) element).getCallableReference().getReferencedName());
      }
      for (PsiElement child : element.getChildren()) {
        walk(child, inner);
      }
    }

    private List<Object> supertypes(KtClassOrObject klass) {
      List<Object> supers = new ArrayList<>();
      for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
        if (entry.getTypeReference() != null) {
          supers.add(entry.getTypeReference().getText().replaceAll("<.*", "").trim());
        }
      }
      return supers;
    }

    private void literal(KtClassOrObject declaration, Frame frame) {
      Frame inner = new Frame(frame, m("k", "object", "supers", supertypes(declaration)));
      for (PsiElement child : declaration.getChildren()) {
        walk(child, inner);
      }
    }

    private String visibility(KtModifierListOwner owner) {
      if (owner.hasModifier(KtTokens.PRIVATE_KEYWORD)) {
        return "private";
      }
      return owner.hasModifier(KtTokens.INTERNAL_KEYWORD) ? "internal" : "public";
    }

    private String effective(String own, Frame frame) {
      String result = own;
      for (Frame f = frame; f != null; f = f.parent) {
        if ("class".equals(f.kind())) {
          String outer = (String) f.data.get("visibility");
          result = "private".equals(outer) || "private".equals(result) ? "private"
              : "internal".equals(outer) || "internal".equals(result) ? "internal" : "public";
        }
      }
      return result;
    }

    private void declareClass(KtClassOrObject klass, Frame frame) {
      Frame owner = frame == null ? null : frame.nearest("class");
      String simple = klass.getName() == null ? "<anonymous>" : klass.getName();
      if (klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion() && klass.getName() == null) {
        simple = "Companion";
      }
      String qualified = owner == null ? simple : owner.data.get("qualified") + "." + simple;
      String kind = klass instanceof KtObjectDeclaration
          ? (((KtObjectDeclaration) klass).isCompanion() ? "companion" : "object")
          : ((KtClass) klass).isInterface() ? "interface" : ((KtClass) klass).isEnum() ? "enum" : "class";
      boolean local = klass.isLocal();
      List<Object> constructor = new ArrayList<>();
      for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
        constructor.add(parameter(parameter));
      }
      List<Object> entries = new ArrayList<>();
      for (KtDeclaration member : klass.getDeclarations()) {
        if (member instanceof KtEnumEntry) {
          entries.add(member.getName());
        }
      }
      boolean superCall = klass.getSuperTypeListEntries().stream().anyMatch(e -> e instanceof KtSuperTypeCallEntry);
      String own = visibility(klass);
      KtPrimaryConstructor primary = klass.getPrimaryConstructor();
      classes.add(
          m(
              "name", simple, "qualified", qualified, "kind", kind, "line", lineOf(klass.getTextOffset()),
              "data", klass instanceof KtClass && ((KtClass) klass).isData(),
              "open", klass.hasModifier(KtTokens.OPEN_KEYWORD) || klass.hasModifier(KtTokens.ABSTRACT_KEYWORD)
                  || klass.hasModifier(KtTokens.SEALED_KEYWORD),
              "local", local, "visibility", effective(own, frame),
              "constructorVisibility", primary == null ? "public" : visibility(primary),
              "annotations", annotationTexts(klass), "supers", supertypes(klass), "superCall", superCall,
              "primaryParameters", constructor, "entries", entries));
      Frame inner = new Frame(frame, m("k", "class", "name", simple, "qualified", qualified,
          "supers", supertypes(klass), "visibility", own));
      for (PsiElement child : klass.getChildren()) {
        walk(child, inner);
      }
    }

    private Map<String, Object> parameter(KtParameter parameter) {
      return m(
          "name", parameter.getName(), "type", clip(parameter.getTypeReference()),
          "vararg", parameter.isVarArg(), "default", parameter.hasDefaultValue(),
          "property", parameter.hasValOrVar() ? (parameter.isMutable() ? "var" : "val") : null,
          "line", lineOf(parameter.getTextOffset()), "annotations", annotationNames(parameter));
    }

    private List<Object> modifiers(KtModifierListOwner owner) {
      List<Object> names = new ArrayList<>();
      for (var token : List.of(KtTokens.OVERRIDE_KEYWORD, KtTokens.OPEN_KEYWORD, KtTokens.ABSTRACT_KEYWORD,
          KtTokens.INFIX_KEYWORD, KtTokens.OPERATOR_KEYWORD, KtTokens.INLINE_KEYWORD, KtTokens.SUSPEND_KEYWORD,
          KtTokens.ACTUAL_KEYWORD, KtTokens.EXPECT_KEYWORD, KtTokens.LATEINIT_KEYWORD)) {
        if (owner.hasModifier(token)) {
          names.add(token.getValue());
        }
      }
      return names;
    }

    private Frame declareFunction(KtNamedFunction function, Frame frame) {
      Frame holder = frame;
      while (holder != null && !"class".equals(holder.kind()) && !"object".equals(holder.kind())) {
        holder = holder.parent;
      }
      boolean anonymous = holder != null && "object".equals(holder.kind());
      Frame owner = frame == null ? null : frame.nearest("class");
      List<Object> parameters = new ArrayList<>();
      for (KtParameter parameter : function.getValueParameters()) {
        parameters.add(parameter(parameter));
      }
      KtExpression body = function.getBodyExpression();
      boolean local = function.isLocal();
      functions.add(
          m(
              "name", function.getName(), "line", lineOf(function.getTextOffset()),
              "owner", anonymous ? "<anonymous>" : owner == null ? "" : owner.data.get("qualified"),
              "local", local, "visibility", local ? "private" : effective(visibility(function), frame),
              "modifiers", modifiers(function), "annotations", annotationNames(function),
              "typeParameters", !function.getTypeParameters().isEmpty(),
              "receiver", clip(function.getReceiverTypeReference()),
              "returnType", clip(function.getTypeReference()), "parameters", parameters,
              "hasBody", body != null,
              "emptyBody", body instanceof KtBlockExpression && ((KtBlockExpression) body).getStatements().isEmpty(),
              "forward", forward(function)));
      return new Frame(frame, m("k", "fun", "name", function.getName()));
    }

    private Frame declareConstructor(KtSecondaryConstructor constructor, Frame frame) {
      Frame owner = frame == null ? null : frame.nearest("class");
      List<Object> parameters = new ArrayList<>();
      for (KtParameter parameter : constructor.getValueParameters()) {
        parameters.add(parameter(parameter));
      }
      functions.add(
          m(
              "name", "<init>", "line", lineOf(constructor.getTextOffset()),
              "owner", owner == null ? "" : owner.data.get("qualified"), "local", false,
              "visibility", effective(visibility(constructor), frame), "modifiers", List.of(),
              "annotations", annotationNames(constructor), "typeParameters", false, "receiver", null,
              "returnType", null, "parameters", parameters, "hasBody", true, "emptyBody", false, "forward", null));
      return new Frame(frame, m("k", "fun", "name", "<init>"));
    }

    private void declareProperty(KtProperty property, Frame frame) {
      Frame owner = frame == null ? null : frame.nearest("class");
      boolean member = owner != null && frame == owner;
      if (!member || property.getName() == null) {
        return;
      }
      properties.add(
          m(
              "name", property.getName(), "line", lineOf(property.getTextOffset()),
              "owner", owner.data.get("qualified"), "type", clip(property.getTypeReference()),
              "var", property.isVar(), "lateinit", property.hasModifier(KtTokens.LATEINIT_KEYWORD),
              "delegated", property.getDelegate() != null, "annotations", annotationNames(property)));
    }

    private Object forward(KtNamedFunction function) {
      KtExpression body = function.getBodyExpression();
      KtExpression expression = null;
      if (body instanceof KtBlockExpression) {
        List<KtExpression> statements = ((KtBlockExpression) body).getStatements();
        if (statements.size() == 1) {
          KtExpression only = statements.get(0);
          expression = only instanceof KtReturnExpression ? ((KtReturnExpression) only).getReturnedExpression() : only;
        }
      } else {
        expression = body;
      }
      if (expression == null) {
        return null;
      }
      expression = KtPsiUtil.safeDeparenthesize(expression);
      KtExpression receiver = null;
      if (expression instanceof KtDotQualifiedExpression) {
        receiver = ((KtDotQualifiedExpression) expression).getReceiverExpression();
        expression = ((KtDotQualifiedExpression) expression).getSelectorExpression();
      }
      if (!(expression instanceof KtCallExpression)) {
        return null;
      }
      KtCallExpression call = (KtCallExpression) expression;
      String name = nameOf(call.getCalleeExpression());
      return name == null ? null
          : m("name", name, "qualifier", clip(receiver), "typeArguments", !call.getTypeArguments().isEmpty(),
              "arguments", arguments(call));
    }

    private List<Object> arguments(KtCallExpression call) {
      List<Object> list = new ArrayList<>();
      for (ValueArgument argument : call.getValueArguments()) {
        KtExpression expression = argument.getArgumentExpression();
        list.add(
            m(
                "name", argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString(),
                "text", clip(expression), "spread", argument.getSpreadElement() != null,
                "lambda", argument instanceof KtLambdaArgument));
      }
      return list;
    }

    private Map<String, Object> lambdaData(KtLambdaExpression lambda) {
      PsiElement parent = lambda.getParent();
      while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
          || parent instanceof KtParenthesizedExpression) {
        parent = parent.getParent();
      }
      String host = null;
      String qualifier = null;
      PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
          : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
      if (call instanceof KtCallExpression) {
        host = nameOf(((KtCallExpression) call).getCalleeExpression());
        PsiElement outer = call.getParent();
        if (outer instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) outer).getSelectorExpression() == call) {
          qualifier = clip(((KtQualifiedExpression) outer).getReceiverExpression());
        }
      } else if (parent instanceof KtBinaryExpression
          && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.IDENTIFIER) {
        host = ((KtBinaryExpression) parent).getOperationReference().getReferencedName();
      }
      return m("k", "lambda", "host", host, "qualifier", qualifier);
    }

    private Map<String, Object> loopData(KtLoopExpression loop) {
      String condition = null;
      if (loop instanceof KtWhileExpression && ((KtWhileExpression) loop).getCondition() != null) {
        condition = clip(((KtWhileExpression) loop).getCondition());
      } else if (loop instanceof KtDoWhileExpression && ((KtDoWhileExpression) loop).getCondition() != null) {
        condition = clip(((KtDoWhileExpression) loop).getCondition());
      } else if (loop instanceof KtForExpression) {
        condition = "for";
      }
      return m("k", "loop", "condition", condition, "text", clip(loop.getText(), BODY_LIMIT));
    }

    private void call(KtCallExpression call, Frame frame) {
      String name = nameOf(call.getCalleeExpression());
      if (name == null) {
        return;
      }
      List<Object> arguments = arguments(call);
      int positional = 0;
      boolean spread = false;
      boolean lambda = false;
      List<String> named = new ArrayList<>();
      for (Object entry : arguments) {
        Map<?, ?> argument = (Map<?, ?>) entry;
        spread |= Boolean.TRUE.equals(argument.get("spread"));
        lambda |= Boolean.TRUE.equals(argument.get("lambda"));
        if (argument.get("name") != null) {
          named.add((String) argument.get("name"));
        } else if (!Boolean.TRUE.equals(argument.get("lambda"))) {
          positional++;
        }
      }
      recordCall(name, positional, named, spread, lambda);
      if (test && WAIT_NAMES.contains(name)) {
        wait(call, name, arguments, frame);
      }
    }

    private void recordCall(String name, int positional, List<String> named, boolean spread, boolean lambda) {
      calls.add(Json.of(m("name", name, "positional", positional, "named", named, "spread", spread, "lambda", lambda)));
    }

    private void delegation(PsiElement element, String name, List<? extends ValueArgument> arguments, List<String> extra) {
      if (name == null) {
        return;
      }
      int positional = 0;
      boolean spread = false;
      List<String> named = new ArrayList<>(extra);
      for (ValueArgument argument : arguments) {
        spread |= argument.getSpreadElement() != null;
        if (argument.getArgumentName() != null) {
          named.add(argument.getArgumentName().getAsName().asString());
        } else {
          positional++;
        }
      }
      recordCall(name, positional, named, spread, false);
    }

    private void constructorDelegation(KtConstructorDelegationCall call, Frame frame) {
      Frame owner = frame == null ? null : frame.nearest("class");
      if (owner == null || call.isImplicit()) {
        return;
      }
      String name = call.isCallToThis() ? (String) owner.data.get("name") : null;
      if (!call.isCallToThis() && !((List<?>) owner.data.get("supers")).isEmpty()) {
        name = (String) ((List<?>) owner.data.get("supers")).get(0);
      }
      delegation(call, name, call.getValueArguments(), List.of());
    }

    private void wait(KtCallExpression call, String name, List<Object> arguments, Frame frame) {
      PsiElement top = call;
      String qualifier = null;
      if (call.getParent() instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
        top = call.getParent();
        qualifier = clip(((KtQualifiedExpression) top).getReceiverExpression());
      }
      Object outer = null;
      if (top.getParent() instanceof KtDotQualifiedExpression) {
        KtDotQualifiedExpression parent = (KtDotQualifiedExpression) top.getParent();
        if (parent.getReceiverExpression() == top && parent.getSelectorExpression() instanceof KtCallExpression) {
          KtCallExpression selector = (KtCallExpression) parent.getSelectorExpression();
          outer = m("name", nameOf(selector.getCalleeExpression()), "arguments", arguments(selector));
        }
      }
      String lambdaText = null;
      for (ValueArgument argument : call.getValueArguments()) {
        KtExpression expression = argument.getArgumentExpression();
        if (expression instanceof KtLambdaExpression) {
          lambdaText = clip(((KtLambdaExpression) expression).getBodyExpression());
        }
      }
      waits.add(
          m(
              "line", lineOf(top.getTextRange().getStartOffset()), "name", name, "qualifier", qualifier,
              "arguments", arguments, "lambda", lambdaText, "statement", top.getParent() instanceof KtBlockExpression,
              "outer", outer, "scopes", frame == null ? List.of() : frame.chain()));
    }

    private String symbolAt(Frame frame) {
      Frame function = frame == null ? null : frame.nearest("fun");
      Frame owner = frame == null ? null : frame.nearest("class");
      List<String> parts = new ArrayList<>();
      if (owner != null) {
        parts.add((String) owner.data.get("qualified"));
      }
      if (function != null) {
        parts.add((String) function.data.get("name"));
      }
      return String.join(".", parts);
    }

    private boolean stable(KtExpression expression) {
      KtExpression plain = KtPsiUtil.safeDeparenthesize(expression);
      if (plain instanceof KtNameReferenceExpression || plain instanceof KtThisExpression) {
        return true;
      }
      return plain instanceof KtDotQualifiedExpression
          && ((KtDotQualifiedExpression) plain).getSelectorExpression() instanceof KtNameReferenceExpression
          && stable(((KtDotQualifiedExpression) plain).getReceiverExpression());
    }

    private String holder(PsiElement start) {
      PsiElement child = start;
      PsiElement parent = start.getParent();
      while (parent instanceof KtParenthesizedExpression
          || (parent instanceof KtBinaryExpression && isLogical((KtBinaryExpression) parent))
          || (parent instanceof KtPrefixExpression && ((KtPrefixExpression) parent).getOperationToken() == KtTokens.EXCL)) {
        child = parent;
        parent = parent.getParent();
      }
      if (parent instanceof KtReturnExpression) {
        return "return";
      }
      if (parent instanceof KtProperty && ((KtProperty) parent).getInitializer() == child) {
        return "variable";
      }
      if (parent instanceof KtNamedFunction && ((KtNamedFunction) parent).getBodyExpression() == child) {
        return "return";
      }
      if (parent instanceof KtBlockExpression && parent.getParent() instanceof KtFunctionLiteral
          && ((KtBlockExpression) parent).getStatements().get(((KtBlockExpression) parent).getStatements().size() - 1) == child) {
        return "lambda";
      }
      if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.EQ
          && ((KtBinaryExpression) parent).getRight() == child) {
        return "assign";
      }
      return "other";
    }

    private boolean isLogical(KtBinaryExpression expression) {
      return expression.getOperationToken() == KtTokens.OROR || expression.getOperationToken() == KtTokens.ANDAND;
    }

    private void operands(KtExpression expression, Object token, List<KtExpression> leaves) {
      KtExpression plain = KtPsiUtil.safeDeparenthesize(expression);
      if (plain instanceof KtBinaryExpression && ((KtBinaryExpression) plain).getOperationToken() == token) {
        operands(((KtBinaryExpression) plain).getLeft(), token, leaves);
        operands(((KtBinaryExpression) plain).getRight(), token, leaves);
      } else {
        leaves.add(plain);
      }
    }

    private void binary(KtBinaryExpression expression, Frame frame) {
      Object token = expression.getOperationToken();
      if (test) {
        return;
      }
      if (isLogical(expression)) {
        PsiElement parent = expression.getParent();
        while (parent instanceof KtParenthesizedExpression) {
          parent = parent.getParent();
        }
        if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getOperationToken() == token) {
          return;
        }
        chain(expression, token, frame);
      } else if (token == KtTokens.IN_KEYWORD || token == KtTokens.NOT_IN) {
        membership(expression, expression.getLeft(), expression.getRight(), frame);
      }
    }

    private void chain(KtBinaryExpression expression, Object token, Frame frame) {
      List<KtExpression> leaves = new ArrayList<>();
      operands(expression, token, leaves);
      Set<Object> wanted = token == KtTokens.OROR
          ? Set.of(KtTokens.EQEQ, KtTokens.EQEQEQ) : Set.of(KtTokens.EXCLEQ, KtTokens.EXCLEQEQEQ);
      List<Object> comparisons = new ArrayList<>();
      for (KtExpression leaf : leaves) {
        if (!(leaf instanceof KtBinaryExpression) || !wanted.contains(((KtBinaryExpression) leaf).getOperationToken())
            || ((KtBinaryExpression) leaf).getLeft() == null || ((KtBinaryExpression) leaf).getRight() == null) {
          return;
        }
        KtBinaryExpression comparison = (KtBinaryExpression) leaf;
        comparisons.add(
            m(
                "left", clip(comparison.getLeft()), "leftStable", stable(comparison.getLeft()),
                "right", clip(comparison.getRight()), "rightStable", stable(comparison.getRight())));
      }
      predicates.add(
          m("kind", "chain", "line", lineOf(expression.getTextRange().getStartOffset()), "symbol", symbolAt(frame),
              "negated", token == KtTokens.ANDAND, "holder", holder(expression), "comparisons", comparisons));
    }

    private void membership(PsiElement at, KtExpression subject, KtExpression collection, Frame frame) {
      KtExpression plain = collection == null ? null : KtPsiUtil.safeDeparenthesize(collection);
      KtCallExpression call = null;
      if (plain instanceof KtCallExpression) {
        call = (KtCallExpression) plain;
      } else if (plain instanceof KtDotQualifiedExpression
          && ((KtDotQualifiedExpression) plain).getSelectorExpression() instanceof KtCallExpression) {
        call = (KtCallExpression) ((KtDotQualifiedExpression) plain).getSelectorExpression();
      }
      if (call == null || subject == null || !COLLECTION_FACTORIES.contains(nameOf(call.getCalleeExpression()))) {
        return;
      }
      List<Object> elements = new ArrayList<>();
      for (ValueArgument argument : call.getValueArguments()) {
        elements.add(clip(argument.getArgumentExpression()));
      }
      predicates.add(
          m("kind", "membership", "line", lineOf(at.getTextRange().getStartOffset()), "symbol", symbolAt(frame),
              "holder", holder(at),
              "subject", clip(subject), "subjectStable", stable(subject), "elements", elements,
              "factory", plain instanceof KtDotQualifiedExpression
                  ? clip(((KtDotQualifiedExpression) plain).getReceiverExpression()) : null));
    }

    private void containsForm(KtDotQualifiedExpression expression, Frame frame) {
      if (test || !(expression.getSelectorExpression() instanceof KtCallExpression)) {
        return;
      }
      KtCallExpression selector = (KtCallExpression) expression.getSelectorExpression();
      if (!"contains".equals(nameOf(selector.getCalleeExpression())) || selector.getValueArguments().size() != 1) {
        return;
      }
      membership(expression, selector.getValueArguments().get(0).getArgumentExpression(),
          expression.getReceiverExpression(), frame);
    }
  }

  static final class Json {
    record Raw(String text) {}

    static String of(Object value) {
      StringBuilder out = new StringBuilder();
      write(out, value);
      return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
      if (value == null) {
        out.append("null");
      } else if (value instanceof Raw raw) {
        out.append(raw.text());
      } else if (value instanceof Map<?, ?> map) {
        out.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
          if (entry.getValue() == null) {
            continue;
          }
          out.append(first ? "" : ",");
          first = false;
          quote(out, String.valueOf(entry.getKey()));
          out.append(':');
          write(out, entry.getValue());
        }
        out.append('}');
      } else if (value instanceof Collection<?> collection) {
        out.append('[');
        boolean first = true;
        for (Object item : collection) {
          out.append(first ? "" : ",");
          first = false;
          write(out, item);
        }
        out.append(']');
      } else if (value instanceof Number || value instanceof Boolean) {
        out.append(value);
      } else {
        quote(out, value.toString());
      }
    }

    private static void quote(StringBuilder out, String text) {
      out.append('"');
      for (char c : text.toCharArray()) {
        switch (c) {
          case '"' -> out.append("\\\"");
          case '\\' -> out.append("\\\\");
          case '\n' -> out.append("\\n");
          case '\r' -> out.append("\\r");
          case '\t' -> out.append("\\t");
          default -> out.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
        }
      }
      out.append('"');
    }
  }
}
