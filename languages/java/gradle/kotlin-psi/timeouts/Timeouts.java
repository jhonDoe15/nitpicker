package nitpicker.kotlinpsi.timeouts;

import static nitpicker.kotlinpsi.common.Psi.*;
import static nitpicker.kotlinpsi.timeouts.TimeoutTrees.*;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Timeouts {
  private static final Set<String> BLOCKS = Set.of("withTimeout", "withTimeoutOrNull");
  private static final Set<String> FUTURE_TIMEOUTS = Set.of("orTimeout", "completeOnTimeout");
  private static final Set<String> WAITS = Set.of("await", "join");
  private static final Set<String> GROUP_WAITS = Set.of("awaitAll", "joinAll");
  private static final Set<String> COLLECTIONS = Set.of("listOf", "setOf", "arrayOf", "mutableListOf");

  private final List<Object> sink;
  private final Lines lines;
  private final Map<String, String> blocks = new HashMap<>();

  public Timeouts(KtFile file, String text, List<Object> sink) {
    this.sink = sink;
    this.lines = new Lines(text);
    for (KtImportDirective directive : file.getImportDirectives()) {
      var path = directive.getImportPath();
      if (path != null && !path.isAllUnder() && path.getAlias() != null) {
        String full = path.getFqName().asString();
        String simple = full.substring(full.lastIndexOf('.') + 1);
        if (BLOCKS.contains(simple)) {
          blocks.put(path.getAlias().asString(), simple);
        }
      }
    }
  }

  public void call(KtCallExpression call, Frame frame) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return;
    }
    String block = blocks.getOrDefault(name, BLOCKS.contains(name) ? name : null);
    Map<String, Object> entry = null;
    int offset = call.getTextRange().getStartOffset();
    if (block != null) {
      entry = block(call, name, block);
    } else if (receiverOf(call) != null) {
      offset = call.getParent().getTextRange().getStartOffset();
      if (FUTURE_TIMEOUTS.contains(name)) {
        entry = FutureWaits.futureTimeout(call, name);
      } else if ("get".equals(name) && call.getValueArguments().size() == 2) {
        entry = FutureWaits.get(call);
      }
    }
    if (entry != null) {
      Map<String, Object> located =
          m("line", lines.index(offset) + 1, "owner", owner(frame), "function", function(frame));
      located.putAll(entry);
      sink.add(located);
    }
  }

  private static String owner(Frame frame) {
    Frame owner = frame == null ? null : frame.nearest("class");
    return owner == null ? "" : String.valueOf(owner.data.get("qualified"));
  }

  private static String function(Frame frame) {
    Frame function = frame == null ? null : frame.nearest("fun");
    return function == null ? "" : String.valueOf(function.data.get("name"));
  }

  private Map<String, Object> block(KtCallExpression call, String written, String canonical) {
    KtLambdaExpression lambda = lambdaOf(call);
    if (lambda == null) {
      return null;
    }
    List<Object> awaited = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (String name : waitedNames(lambda)) {
      KtProperty declared = localProperty(name, call, lambda);
      if (declared != null && seen.add(name)) {
        awaited.add(startedBy(name, declared));
      }
    }
    return awaited.isEmpty()
        ? null
        : m("kind", canonical, "name", written, "awaited", awaited, "stops", stops(enclosingBody(call)));
  }

  private static KtLambdaExpression lambdaOf(KtCallExpression call) {
    for (KtLambdaArgument argument : call.getLambdaArguments()) {
      return argument.getLambdaExpression();
    }
    for (ValueArgument argument : call.getValueArguments()) {
      if (argument.getArgumentExpression() instanceof KtLambdaExpression lambda) {
        return lambda;
      }
    }
    return null;
  }

  private static List<String> waitedNames(KtLambdaExpression lambda) {
    List<String> names = new ArrayList<>();
    for (PsiElement element : descendants(lambda, true)) {
      if (!(element instanceof KtCallExpression call)) {
        continue;
      }
      String name = nameOf(call.getCalleeExpression());
      KtExpression receiver = receiverOf(call);
      if (WAITS.contains(name) && receiver instanceof KtNameReferenceExpression reference) {
        names.add(reference.getReferencedName());
      } else if (GROUP_WAITS.contains(name)) {
        names.addAll(argumentNames(receiver == null ? call : collectionOf(receiver)));
      }
    }
    return names;
  }

  private static KtCallExpression collectionOf(KtExpression receiver) {
    return receiver instanceof KtCallExpression call && COLLECTIONS.contains(nameOf(call.getCalleeExpression()))
        ? call
        : null;
  }

  private static List<String> argumentNames(KtCallExpression call) {
    List<String> names = new ArrayList<>();
    for (KtValueArgument argument : call == null ? List.<KtValueArgument>of() : call.getValueArguments()) {
      if (argument.getArgumentExpression() instanceof KtNameReferenceExpression reference) {
        names.add(reference.getReferencedName());
      }
    }
    return names;
  }

  private static Map<String, Object> startedBy(String name, KtProperty declared) {
    KtExpression initializer = declared.getInitializer();
    String scope = null;
    String starter = null;
    if (initializer instanceof KtQualifiedExpression qualified
        && qualified.getSelectorExpression() instanceof KtCallExpression selector) {
      scope = clip(qualified.getReceiverExpression());
      starter = nameOf(selector.getCalleeExpression());
    } else if (initializer instanceof KtCallExpression direct) {
      starter = nameOf(direct.getCalleeExpression());
    }
    return m("name", name, "scope", scope, "starter", starter);
  }
}
