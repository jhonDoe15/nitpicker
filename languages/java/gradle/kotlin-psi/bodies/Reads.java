package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import java.util.function.Function;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Reads {
  private static final Set<String> RESULT_HOSTS = Set.of("let", "run", "with", "use", "map", "mapNotNull", "flatMap",
      "mapIndexed", "mapIndexedNotNull", "firstNotNullOf", "firstNotNullOfOrNull");
  private static final Set<String> KEEP_HOSTS = Set.of("also", "apply", "takeIf", "takeUnless", "onEach", "filter",
      "filterNot", "filterIndexed", "sortedBy", "sortedByDescending", "distinctBy", "forEach", "forEachIndexed",
      "first", "firstOrNull", "last", "lastOrNull", "find", "single", "singleOrNull", "any", "all", "none", "count");
  private static final Set<String> LOOKUPS = Set.of("get", "getValue", "getOrDefault", "getOrElse", "getOrPut",
      "containsKey");
  private static final Set<Object> TESTS = Set.of(KtTokens.EQEQ, KtTokens.EXCLEQ, KtTokens.EQEQEQ,
      KtTokens.EXCLEQEQEQ, KtTokens.LT, KtTokens.GT, KtTokens.LTEQ, KtTokens.GTEQ, KtTokens.ANDAND, KtTokens.OROR,
      KtTokens.IN_KEYWORD, KtTokens.NOT_IN);

  private record Context(List<String> calls, List<String> prefixes) {
    Context call(String name) {
      List<String> more = new ArrayList<>(calls);
      more.add(name == null ? "" : name);
      return new Context(more, prefixes);
    }

    Context prefix(String text) {
      List<String> more = new ArrayList<>(prefixes);
      more.add(text);
      return new Context(calls, more);
    }
  }

  private final boolean active;
  private final Map<KtLambdaExpression, Frame> lambdas = new IdentityHashMap<>();
  private final List<Map<String, Object>> pending = new ArrayList<>();
  private final List<KtLambdaExpression> pendingLambdas = new ArrayList<>();

  public Reads(boolean active) {
    this.active = active;
  }

  public void enter(KtLambdaExpression lambda, Frame frame) {
    lambdas.put(lambda, frame);
  }

  Frame frameOf(KtLambdaExpression lambda) {
    return lambdas.get(lambda);
  }

  public List<Object> of(PsiElement root) {
    if (!active || root == null) {
      return null;
    }
    List<Object> found = new ArrayList<>();
    walk(root, new Context(List.of(), List.of()), found);
    return found.isEmpty() ? null : found;
  }

  void resolve(Function<Frame, Integer> ids) {
    for (int index = 0; index < pending.size(); index++) {
      Frame frame = lambdas.get(pendingLambdas.get(index));
      pending.get(index).put("lambda", frame == null ? null : ids.apply(frame));
    }
  }

  static KtCallExpression hostOf(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  static KtExpression sourceOf(KtLambdaExpression lambda) {
    KtCallExpression call = hostOf(lambda);
    if (call == null) {
      return null;
    }
    List<? extends ValueArgument> values = call.getValueArguments();
    if ("with".equals(nameOf(call.getCalleeExpression())) && !values.isEmpty()
        && !(values.get(0).getArgumentExpression() instanceof KtLambdaExpression)) {
      return values.get(0).getArgumentExpression();
    }
    PsiElement outer = call.getParent();
    return outer instanceof KtQualifiedExpression && ((KtQualifiedExpression) outer).getSelectorExpression() == call
        ? ((KtQualifiedExpression) outer).getReceiverExpression() : null;
  }

  Frame labeled(KtReturnExpression returned) {
    String label = returned.getLabelName();
    for (PsiElement up = returned.getParent(); up != null && !(up instanceof KtNamedFunction); up = up.getParent()) {
      if (up instanceof KtLambdaExpression lambda) {
        KtCallExpression host = hostOf(lambda);
        String own = lambda.getParent() instanceof KtLabeledExpression labeled ? labeled.getLabelName()
            : host == null ? null : nameOf(host.getCalleeExpression());
        if (label != null && label.equals(own)) {
          return lambdas.get(lambda);
        }
      }
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  List<Object> arguments(KtCallExpression call, List<Object> list) {
    List<? extends ValueArgument> values = call.getValueArguments();
    for (int index = 0; index < values.size(); index++) {
      KtExpression expression = values.get(index).getArgumentExpression();
      if (!(expression instanceof KtLambdaExpression)) {
        ((Map<String, Object>) list.get(index)).put("reads", of(expression));
      }
    }
    return list;
  }

  private void walk(PsiElement element, Context context, List<Object> found) {
    if (element == null || element instanceof KtDeclaration || element instanceof KtObjectLiteralExpression
        || element instanceof KtTypeReference || element instanceof KtTypeArgumentList
        || element instanceof KtReturnExpression || element instanceof KtThrowExpression
        || element instanceof KtIsExpression || element instanceof KtClassLiteralExpression
        || element instanceof KtLambdaExpression || element instanceof KtConstantExpression) {
      return;
    }
    if (element instanceof KtNameReferenceExpression name) {
      found.add(read(name.getReferencedName(), member(name), context));
    } else if (element instanceof KtThisExpression self) {
      found.add(read("this", member(self), context));
    } else if (element instanceof KtQualifiedExpression qualified) {
      qualified(qualified, context, found);
    } else if (element instanceof KtCallExpression call) {
      call(call, false, context, found);
    } else if (element instanceof KtBinaryExpression binary) {
      binary(binary, context, found);
    } else if (element instanceof KtStringTemplateExpression template) {
      template(template, context, found);
    } else {
      structured(element, context, found);
    }
  }

  private void structured(PsiElement element, Context context, List<Object> found) {
    if (element instanceof KtPrefixExpression prefix && prefix.getOperationToken() == KtTokens.EXCL) {
      return;
    }
    if (element instanceof KtIfExpression branch) {
      walk(branch.getThen(), context, found);
      walk(branch.getElse(), context, found);
    } else if (element instanceof KtWhenExpression when) {
      for (KtWhenEntry entry : when.getEntries()) {
        walk(entry.getExpression(), context, found);
      }
    } else if (element instanceof KtArrayAccessExpression access) {
      walk(access.getArrayExpression(), context, found);
    } else if (element instanceof KtBlockExpression block) {
      List<KtExpression> statements = block.getStatements();
      walk(statements.isEmpty() ? null : statements.get(statements.size() - 1), context, found);
    } else if (element instanceof KtCallableReferenceExpression reference) {
      walk(reference.getReceiverExpression(), context, found);
    } else {
      for (PsiElement child : element.getChildren()) {
        walk(child, context, found);
      }
    }
  }

  private void qualified(KtQualifiedExpression qualified, Context context, List<Object> found) {
    KtExpression selector = qualified.getSelectorExpression();
    if (!(selector instanceof KtCallExpression call)) {
      walk(qualified.getReceiverExpression(), context, found);
      return;
    }
    if (!(RESULT_HOSTS.contains(nameOf(call.getCalleeExpression())) && !call.getLambdaArguments().isEmpty())) {
      walk(qualified.getReceiverExpression(), context, found);
    }
    call(call, true, context, found);
  }

  private void call(KtCallExpression call, boolean qualified, Context context, List<Object> found) {
    String name = nameOf(call.getCalleeExpression());
    boolean scoped = RESULT_HOSTS.contains(name) && !call.getLambdaArguments().isEmpty();
    List<? extends ValueArgument> arguments = call.getValueArguments();
    for (int index = 0; index < arguments.size(); index++) {
      KtExpression expression = arguments.get(index).getArgumentExpression();
      boolean key = index == 0 && qualified && LOOKUPS.contains(name);
      if (expression instanceof KtLambdaExpression lambda) {
        if (!KEEP_HOSTS.contains(name)) {
          Map<String, Object> read = read(null, null, context);
          pending.add(read);
          pendingLambdas.add(lambda);
          found.add(read);
        }
      } else if (!key && !(scoped && !qualified)) {
        walk(expression, context.call(name), found);
      }
    }
  }

  private void binary(KtBinaryExpression binary, Context context, List<Object> found) {
    Object token = binary.getOperationToken();
    if (TESTS.contains(token)) {
      return;
    }
    if (token != KtTokens.PLUS) {
      walk(binary.getLeft(), context, found);
      walk(binary.getRight(), context, found);
      return;
    }
    Deque<KtExpression> operands = new ArrayDeque<>();
    KtExpression current = binary;
    while (current instanceof KtBinaryExpression plus && plus.getOperationToken() == KtTokens.PLUS) {
      operands.addFirst(plus.getRight());
      current = plus.getLeft();
    }
    operands.addFirst(current);
    StringBuilder lead = new StringBuilder();
    boolean literal = true;
    for (KtExpression operand : operands) {
      walk(operand, literal && lead.length() > 0 ? context.prefix(lead.toString()) : context, found);
      String text = literalText(operand);
      literal = literal && text != null;
      lead.append(text == null ? "" : text);
    }
  }

  private void template(KtStringTemplateExpression template, Context context, List<Object> found) {
    StringBuilder lead = new StringBuilder();
    boolean literal = true;
    for (KtStringTemplateEntry entry : template.getEntries()) {
      if (entry instanceof KtStringTemplateEntryWithExpression) {
        walk(entry.getExpression(), literal && lead.length() > 0 ? context.prefix(lead.toString()) : context, found);
        literal = false;
      } else {
        lead.append(entryText(entry));
      }
    }
  }

  private static String literalText(KtExpression expression) {
    if (!(expression instanceof KtStringTemplateExpression template) || template.hasInterpolation()) {
      return null;
    }
    StringBuilder text = new StringBuilder();
    for (KtStringTemplateEntry entry : template.getEntries()) {
      text.append(entryText(entry));
    }
    return text.toString();
  }

  private static String entryText(KtStringTemplateEntry entry) {
    return entry instanceof KtEscapeStringTemplateEntry
        ? ((KtEscapeStringTemplateEntry) entry).getUnescapedValue() : entry.getText();
  }

  private static String member(KtExpression root) {
    PsiElement parent = root.getParent();
    if (parent instanceof KtQualifiedExpression qualified && qualified.getReceiverExpression() == root) {
      KtExpression selector = qualified.getSelectorExpression();
      return selector instanceof KtCallExpression ? nameOf(((KtCallExpression) selector).getCalleeExpression())
          : nameOf(selector);
    }
    if (parent instanceof KtArrayAccessExpression access && access.getArrayExpression() == root) {
      return "get";
    }
    if (parent instanceof KtCallableReferenceExpression reference && reference.getReceiverExpression() == root) {
      return nameOf(reference.getCallableReference());
    }
    return null;
  }

  private static Map<String, Object> read(String name, String member, Context context) {
    return m("name", name, "member", member, "calls", context.calls().isEmpty() ? null : context.calls(),
        "prefixes", context.prefixes().isEmpty() ? null : context.prefixes());
  }
}
