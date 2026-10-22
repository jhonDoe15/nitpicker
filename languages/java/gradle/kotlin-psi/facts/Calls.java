package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;
import nitpicker.kotlinpsi.common.Json;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Calls {
  static final Set<String> WAIT_NAMES =
      Set.of(
          "sleep", "parkNanos", "wait", "join", "delay", "continually", "after", "waitForTimeout",
          "until", "pollDelay", "during");

  static final Set<String> LOOKUP_NAMES =
      Set.of(
          "get", "getOrNull", "getAll", "inject", "injectOrNull", "getKoin", "koinInject", "koinViewModel",
          "getInstance", "getProvider", "getBinding", "getExistingBinding", "current", "select",
          "getReference", "getInjectableReference", "createInstance", "lookup", "lookupLink");

  private final State state;

  Calls(State state) {
    this.state = state;
  }

  void call(KtCallExpression call, Frame frame) {
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
    if (state.locatorImports && LOOKUP_NAMES.contains(name)) {
      lookup(call, name, positional, lambda, frame);
    }
    String imported = state.importedPath(name);
    String waitName = imported == null ? name : imported.substring(imported.lastIndexOf('.') + 1);
    if (state.test && WAIT_NAMES.contains(waitName)) {
      wait(call, waitName, imported, arguments, frame);
    }
  }

  private void lookup(KtCallExpression call, String name, int positional, boolean lambda, Frame frame) {
    String qualifier = null;
    if (call.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
      qualifier = clip(((KtQualifiedExpression) call.getParent()).getReceiverExpression());
    }
    state.lookups.add(
        m(
            "line", state.lineOf(call.getTextRange().getStartOffset()), "name", name, "qualifier", qualifier,
            "positional", positional, "lambda", lambda, "delegated", call.getParent() instanceof KtPropertyDelegate,
            "annotations", enclosingAnnotations(call), "scopes", frame == null ? List.of() : frame.chain()));
  }

  private List<Object> enclosingAnnotations(PsiElement element) {
    List<Object> names = new ArrayList<>();
    for (PsiElement parent = element.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction || parent instanceof KtClassOrObject) {
        names.addAll(annotationNames((KtAnnotated) parent));
      }
    }
    return names;
  }

  private void recordCall(String name, int positional, List<String> named, boolean spread, boolean lambda) {
    state.calls.add(
        Json.of(
            m("name", name, "positional", positional, "named", named, "spread", spread, "lambda", lambda)));
  }

  void delegation(PsiElement element, String name, List<? extends ValueArgument> arguments, List<String> extra) {
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

  void constructorDelegation(KtConstructorDelegationCall call, Frame frame) {
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

  private void wait(
      KtCallExpression call, String name, String imported, List<Object> arguments, Frame frame) {
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
    state.waits.add(
        m(
            "line", state.lineOf(top.getTextRange().getStartOffset()), "name", name, "qualifier", qualifier,
            "imported", qualifier == null ? imported : null,
            "arguments", arguments, "lambda", lambdaText, "statement", top.getParent() instanceof KtBlockExpression,
            "outer", outer, "scopes", frame == null ? List.of() : frame.chain()));
  }
}
