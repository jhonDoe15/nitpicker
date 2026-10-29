package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import nitpicker.kotlinpsi.common.Lines;
import nitpicker.kotlinpsi.coroutines.CoroutineScopes.Scope;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class CoroutineFacts {
  private static final Set<String> TIMEOUTS = Set.of("withTimeout", "withTimeoutOrNull");
  private static final Set<String> FLOW_BUILDERS = Set.of("flow", "channelFlow", "callbackFlow");
  private static final String FLOW_PACKAGE = "kotlinx.coroutines.flow";

  private final KtFile file;
  private final Set<String> timeoutNames = new HashSet<>(TIMEOUTS);
  private final Set<String> flowBuilders = new HashSet<>();
  private final Lines lines;
  private final List<Object> calls = new ArrayList<>();
  private final List<Object> timeouts = new ArrayList<>();

  public CoroutineFacts(KtFile file, String text) {
    this.file = file;
    this.lines = new Lines(text);
    for (KtImportDirective directive : file.getImportDirectives()) {
      if (directive.getImportedFqName() == null) {
        continue;
      }
      String imported = directive.getImportedFqName().asString();
      String shortName = directive.getImportedFqName().shortName().asString();
      String local = directive.getAliasName() == null ? shortName : directive.getAliasName();
      if (directive.getAliasName() != null && imported.startsWith("kotlinx.coroutines.")
          && TIMEOUTS.contains(shortName)) {
        timeoutNames.add(local);
      }
      if (directive.isAllUnder() && imported.equals(FLOW_PACKAGE)) {
        flowBuilders.addAll(FLOW_BUILDERS);
      } else if (imported.equals(FLOW_PACKAGE + "." + shortName) && FLOW_BUILDERS.contains(shortName)) {
        flowBuilders.add(local);
      }
    }
  }

  public Map<String, Object> collect() {
    walk(file, Scope.none(null, null));
    return calls.isEmpty() && timeouts.isEmpty() ? null : m("calls", calls, "timeouts", timeouts);
  }

  private void walk(PsiElement element, Scope scope) {
    Scope inner = scope;
    if (element instanceof KtNamedFunction function) {
      inner = function.hasModifier(KtTokens.SUSPEND_KEYWORD)
          ? new Scope(true, false, scope.owner(), function.getName())
          : Scope.none(scope.owner(), function.getName());
    } else if (element instanceof KtClassOrObject klass) {
      inner = Scope.none(ownerOf(klass, scope.owner()), scope.function());
    } else if (element instanceof KtPropertyAccessor || element instanceof KtClassInitializer
        || element instanceof KtSecondaryConstructor) {
      inner = scope.none();
    } else if (element instanceof KtLambdaExpression lambda) {
      inner = CoroutineScopes.of(lambda, scope, flowBuilders);
    } else if (element instanceof KtCallExpression call) {
      observe(call, scope);
    }
    for (PsiElement child : element.getChildren()) {
      walk(child, inner);
    }
  }

  private static String ownerOf(KtClassOrObject klass, String enclosing) {
    boolean companion = klass instanceof KtObjectDeclaration object && object.isCompanion();
    String simple = klass.getName() != null ? klass.getName() : companion ? "Companion" : "<anonymous>";
    return enclosing == null ? simple : enclosing + "." + simple;
  }

  private void observe(KtCallExpression call, Scope scope) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return;
    }
    if (scope.coroutine() && !scope.offloaded()) {
      calls.add(record(call, name, scope));
    }
    if (timeoutNames.contains(name) && call.getLambdaArguments().size() == 1) {
      timeouts.add(timeout(call, name, scope));
    }
  }

  private Map<String, Object> record(KtCallExpression call, String name, Scope scope) {
    KtExpression receiver = CoroutineScopes.receiverOf(call);
    return m(
        "line", lines.index(call.getTextOffset()) + 1, "name", name, "owner", scope.owner(),
        "function", scope.function(),
        "qualifier", clip(receiver), "staticOwner", staticOwner(receiver),
        "receiverType", ReceiverTypes.of(receiver), "arguments", call.getValueArguments().size());
  }

  private static String staticOwner(KtExpression receiver) {
    if (receiver instanceof KtNameReferenceExpression name) {
      return name.getReferencedName();
    }
    if (receiver instanceof KtDotQualifiedExpression dotted
        && dotted.getSelectorExpression() instanceof KtNameReferenceExpression
        && staticOwner(dotted.getReceiverExpression()) != null) {
      return staticOwner(dotted.getReceiverExpression()) + "." + nameOf(dotted.getSelectorExpression());
    }
    return null;
  }

  private Map<String, Object> timeout(KtCallExpression call, String name, Scope scope) {
    KtLambdaExpression lambda = call.getLambdaArguments().get(0).getLambdaExpression();
    Body body = new Body();
    body.collect(lambda.getBodyExpression());
    List<Object> inside = new ArrayList<>();
    for (KtCallExpression nested : body.calls) {
      inside.add(record(nested, nameOf(nested.getCalleeExpression()), scope));
    }
    return m(
        "line", lines.index(call.getTextOffset()) + 1, "builder", name, "owner", scope.owner(),
        "function", scope.function(), "calls", inside,
        "references", new ArrayList<>(body.references), "whileLoops", body.whileLoops,
        "opaqueLoops", body.opaqueLoops);
  }

  private static final class Body {
    final List<KtCallExpression> calls = new ArrayList<>();
    final Set<String> references = new TreeSet<>();
    int whileLoops;
    int opaqueLoops;

    void collect(PsiElement element) {
      if (element == null || element instanceof KtNamedFunction || element instanceof KtClassOrObject) {
        return;
      }
      if (element instanceof KtCallExpression call && nameOf(call.getCalleeExpression()) != null) {
        calls.add(call);
      } else if (element instanceof KtNameReferenceExpression name && !(name.getParent() instanceof KtCallExpression)) {
        references.add(name.getReferencedName());
      } else if (element instanceof KtWhileExpressionBase) {
        whileLoops++;
      } else if (element instanceof KtForExpression loop && !isRange(loop.getLoopRange())) {
        opaqueLoops++;
      }
      for (PsiElement child : element.getChildren()) {
        collect(child);
      }
    }

    private static boolean isRange(KtExpression range) {
      if (range instanceof KtBinaryExpression binary) {
        String operator = binary.getOperationReference().getReferencedName();
        return List.of("..", "..<", "until", "downTo", "step").contains(operator);
      }
      return range instanceof KtDotQualifiedExpression dotted
          && "indices".equals(nameOf(dotted.getSelectorExpression()));
    }
  }
}
