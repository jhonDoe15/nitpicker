package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtClassInitializer;
import org.jetbrains.kotlin.psi.KtClassOrObject;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtFunction;
import org.jetbrains.kotlin.psi.KtFunctionLiteral;
import org.jetbrains.kotlin.psi.KtLambdaArgument;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtPropertyAccessor;
import org.jetbrains.kotlin.psi.KtValueArgument;
import org.jetbrains.kotlin.psi.KtValueArgumentList;

final class Coroutines {
  private static final Set<String> BUILDERS =
      Set.of(
          "launch", "async", "runBlocking", "withContext", "coroutineScope", "supervisorScope", "withTimeout",
          "withTimeoutOrNull", "runTest", "flow", "channelFlow", "callbackFlow", "produce", "actor", "future",
          "promise", "suspend");
  private static final Set<String> INLINE =
      Set.of(
          "let", "run", "also", "apply", "with", "use", "takeIf", "takeUnless", "repeat", "forEach",
          "forEachIndexed", "map", "mapNotNull", "mapIndexed", "flatMap", "filter", "filterNot", "fold", "any",
          "all", "none", "first", "firstOrNull", "sumOf", "associate", "associateBy", "associateWith", "groupBy",
          "onEach", "synchronized", "withLock", "getOrElse", "getOrPut", "ifEmpty", "buildList", "buildMap",
          "buildSet", "buildString", "measureTimeMillis", "measureTime", "runCatching", "collect",
          "collectLatest", "transform");

  private Coroutines() {}

  static boolean suspending(PsiElement start) {
    for (PsiElement up = start.getParent(); up != null; up = up.getParent()) {
      if (up instanceof KtLambdaExpression) {
        String call = calleeOf((KtLambdaExpression) up);
        if (call == null || !INLINE.contains(call)) {
          return call != null && BUILDERS.contains(call);
        }
      } else if (up instanceof KtFunction && !(up instanceof KtFunctionLiteral)) {
        return ((KtFunction) up).hasModifier(KtTokens.SUSPEND_KEYWORD);
      } else if (up instanceof KtPropertyAccessor || up instanceof KtClassInitializer
          || up instanceof KtClassOrObject || up instanceof KtFile) {
        return false;
      }
    }
    return false;
  }

  private static String calleeOf(KtLambdaExpression lambda) {
    PsiElement argument = lambda.getParent();
    PsiElement owner = argument instanceof KtLambdaArgument ? argument.getParent()
        : argument instanceof KtValueArgument && argument.getParent() instanceof KtValueArgumentList
            ? argument.getParent().getParent() : null;
    return owner instanceof KtCallExpression ? nameOf(((KtCallExpression) owner).getCalleeExpression()) : null;
  }
}
