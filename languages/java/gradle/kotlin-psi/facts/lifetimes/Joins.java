package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Joins {
  private static final Set<String> SINGLE = Hosts.names("join", "await", "cancelAndJoin");
  private static final Set<String> ALL = Hosts.names("joinAll", "awaitAll");
  private static final Set<String> PASSING =
      Hosts.names("also", "let", "apply", "run", "forEach", "onEach", "map", "mapNotNull");
  private static final Set<String> COLLECTIONS =
      Hosts.names("listOf", "mutableListOf", "arrayListOf", "setOf", "mutableSetOf", "arrayOf");
  private static final Set<String> ADDING = Hosts.names("add", "addLast", "addFirst", "plusAssign");
  private static final Set<String> RUNNING_LAMBDAS =
      Hosts.names("coroutineScope", "supervisorScope", "runBlocking", "withContext", "withTimeout",
          "withTimeoutOrNull", "let", "also", "forEach", "forEachIndexed", "repeat", "takeIf", "takeUnless",
          "use", "map", "mapNotNull", "filter", "run", "apply", "with", "synchronized");

  private Joins() {}

  static boolean outlives(KtCallExpression launch, KtLambdaExpression block) {
    PsiElement value = Hosts.outermost(selected(launch));
    while (true) {
      PsiElement parent = value.getParent();
      if (parent instanceof KtQualifiedExpression
          && ((KtQualifiedExpression) parent).getReceiverExpression() == value) {
        return afterJob(((KtQualifiedExpression) parent).getSelectorExpression(), launch, block);
      }
      if (parent instanceof KtProperty && ((KtProperty) parent).getInitializer() == value) {
        return !holderJoined(((KtProperty) parent).getName(), launch, block);
      }
      if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getRight() == value
          && isAssignment((KtBinaryExpression) parent)) {
        return !holderJoined(holderName(((KtBinaryExpression) parent).getLeft()), launch, block);
      }
      if (!(parent instanceof KtValueArgument || parent instanceof KtValueArgumentList)) {
        return true;
      }
      KtCallExpression call = PsiTreeUtil.getParentOfType(parent, KtCallExpression.class);
      String callee = call == null ? null : nameOf(call.getCalleeExpression());
      if (ALL.contains(callee)) {
        return !unconditional(call, launch, block);
      }
      if (COLLECTIONS.contains(callee)) {
        value = Hosts.outermost(call);
        continue;
      }
      if (ADDING.contains(callee) && Hosts.receiverOf(call) != null) {
        return !holderJoined(holderName(Hosts.receiverOf(call)), launch, block);
      }
      return false;
    }
  }

  private static PsiElement selected(KtCallExpression launch) {
    PsiElement parent = launch.getParent();
    return parent instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) parent).getSelectorExpression() == launch
        ? parent
        : launch;
  }

  private static boolean afterJob(
      KtExpression selector, KtCallExpression launch, KtLambdaExpression block) {
    String name = selector instanceof KtCallExpression
        ? nameOf(((KtCallExpression) selector).getCalleeExpression())
        : null;
    if (SINGLE.contains(name) || ALL.contains(name)) {
      return !unconditional(selector, launch, block);
    }
    return !PASSING.contains(name);
  }

  private static boolean isAssignment(KtBinaryExpression expression) {
    return expression.getOperationToken() == KtTokens.EQ
        || expression.getOperationToken() == KtTokens.PLUSEQ;
  }

  private static String holderName(KtExpression target) {
    KtExpression subject = target instanceof KtQualifiedExpression
        ? ((KtQualifiedExpression) target).getSelectorExpression()
        : target;
    return nameOf(subject);
  }

  private static boolean holderJoined(String holder, KtCallExpression launch, KtLambdaExpression block) {
    return holder == null || joins(block.getBodyExpression(), holder, launch, block);
  }

  private static boolean joins(
      PsiElement element, String holder, KtCallExpression launch, KtLambdaExpression block) {
    if (element == null || Hosts.isBoundary(element)) {
      return false;
    }
    if (element instanceof KtCallExpression && joinsHolder((KtCallExpression) element, holder, launch)
        && unconditional(element, launch, block)) {
      return true;
    }
    for (PsiElement child : element.getChildren()) {
      if (joins(child, holder, launch, block)) {
        return true;
      }
    }
    return false;
  }

  private static boolean joinsHolder(KtCallExpression call, String holder, KtCallExpression launch) {
    String name = nameOf(call.getCalleeExpression());
    if (call.getTextOffset() <= launch.getTextOffset() || !(SINGLE.contains(name) || ALL.contains(name))) {
      return false;
    }
    KtExpression receiver = Hosts.receiverOf(call);
    if (receiver != null && Hosts.mentions(receiver, Set.of(holder))) {
      return true;
    }
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression != null && Hosts.mentions(expression, Set.of(holder))) {
        return true;
      }
    }
    return overHolder(call, holder);
  }

  private static boolean overHolder(PsiElement call, String holder) {
    for (PsiElement parent = call.getParent(); parent != null && !Hosts.isBoundary(parent);
        parent = parent.getParent()) {
      if (parent instanceof KtForExpression
          && ((KtForExpression) parent).getLoopRange() != null
          && Hosts.mentions(((KtForExpression) parent).getLoopRange(), Set.of(holder))) {
        return true;
      }
      if (parent instanceof KtLambdaExpression) {
        KtCallExpression host = Hosts.of((KtLambdaExpression) parent);
        KtExpression receiver = host == null ? null : Hosts.receiverOf(host);
        if (receiver != null && Hosts.mentions(receiver, Set.of(holder))) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean unconditional(PsiElement join, KtCallExpression launch, KtLambdaExpression block) {
    for (PsiElement region = join; region != null && region != block; region = region.getParent()) {
      if (isConditional(region) && !PsiTreeUtil.isAncestor(region, launch, false)) {
        return false;
      }
    }
    return true;
  }

  private static boolean isConditional(PsiElement element) {
    if (element instanceof KtLambdaExpression) {
      String host = Hosts.nameOfHost((KtLambdaExpression) element);
      return host == null || !RUNNING_LAMBDAS.contains(host);
    }
    PsiElement parent = element.getParent();
    return element instanceof KtContainerNodeForControlStructureBody
        || element instanceof KtWhenEntry
        || element instanceof KtCatchClause
        || parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getRight() == element
            && isShortCircuit((KtBinaryExpression) parent);
  }

  private static boolean isShortCircuit(KtBinaryExpression expression) {
    return expression.getOperationToken() == KtTokens.ANDAND
        || expression.getOperationToken() == KtTokens.OROR
        || expression.getOperationToken() == KtTokens.ELVIS;
  }
}
