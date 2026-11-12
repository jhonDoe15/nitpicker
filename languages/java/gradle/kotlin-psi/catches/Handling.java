package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import nitpicker.kotlinpsi.bodies.Throwing;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtClass;
import org.jetbrains.kotlin.psi.KtDeclarationWithBody;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtNameReferenceExpression;
import org.jetbrains.kotlin.psi.KtPsiUtil;
import org.jetbrains.kotlin.psi.KtQualifiedExpression;
import org.jetbrains.kotlin.psi.KtSuperTypeListEntry;
import org.jetbrains.kotlin.psi.KtThisExpression;
import org.jetbrains.kotlin.psi.KtValueArgument;

final class Handling {
  static final Set<String> LOG_LEVELS =
      Set.of(
          "trace", "debug", "info", "warn", "warning", "error", "fatal", "severe", "fine", "finer", "finest",
          "config", "log", "atTrace", "atDebug", "atInfo", "atWarn", "atError", "v", "d", "i", "w", "e", "wtf");
  static final List<Pattern> LOGGER_NAMES =
      List.of(
          Pattern.compile("^(?:log|logger)$", Pattern.CASE_INSENSITIVE),
          Pattern.compile("[a-z0-9](?:Log|Logger)$"),
          Pattern.compile("_(?:log|logger)$", Pattern.CASE_INSENSITIVE));
  static final Set<String> CONSOLE = Set.of("print", "println", "printf", "format");
  static final String STACK_TRACE = "printStackTrace";
  private static final Set<String> CONSOLE_OWNERS = Set.of("System.out", "System.err");
  private static final Set<String> THREADS = Set.of("Thread", "java.lang.Thread");
  private static final Set<String> ONCE =
      Set.of(
          "run", "let", "also", "apply", "with", "use", "synchronized", "withLock", "withContext",
          "coroutineScope", "supervisorScope");

  private final String caught;
  private final boolean cancellation;
  private final Throwing throwing;

  Handling(String caught, boolean cancellation, Throwing throwing) {
    this.caught = caught;
    this.cancellation = cancellation;
    this.throwing = throwing;
  }

  boolean stops(KtCallExpression call) {
    return throwing.fails(call) || restores(call) || handsOff(call);
  }

  static KtLambdaExpression onceLambda(KtCallExpression call) {
    if (!ONCE.contains(nameOf(call.getCalleeExpression())) || call.getLambdaArguments().size() != 1) {
      return null;
    }
    return call.getLambdaArguments().get(0).getLambdaExpression();
  }

  private boolean restores(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    if (cancellation) {
      return "ensureActive".equals(name);
    }
    if (!"interrupt".equals(name) || !call.getValueArguments().isEmpty()) {
      return false;
    }
    KtExpression receiver = receiverOf(call);
    if (receiver == null || receiver instanceof KtThisExpression) {
      return insideThread(call);
    }
    KtExpression selector = receiver instanceof KtQualifiedExpression
        ? ((KtQualifiedExpression) receiver).getSelectorExpression() : receiver;
    boolean owner = !(receiver instanceof KtQualifiedExpression)
        || THREADS.contains(((KtQualifiedExpression) receiver).getReceiverExpression().getText());
    return owner && selector instanceof KtCallExpression
        && "currentThread".equals(nameOf(((KtCallExpression) selector).getCalleeExpression()))
        && ((KtCallExpression) selector).getValueArguments().isEmpty();
  }

  private static boolean insideThread(PsiElement element) {
    KtClass owner = PsiTreeUtil.getParentOfType(element, KtClass.class);
    if (owner == null) {
      return false;
    }
    for (KtSuperTypeListEntry entry : owner.getSuperTypeListEntries()) {
      if (entry.getTypeReference() != null && THREADS.contains(entry.getTypeReference().getText())) {
        return true;
      }
    }
    return false;
  }

  private boolean handsOff(KtCallExpression call) {
    if (reporting(call) || !passesCaught(call)) {
      return false;
    }
    for (PsiElement up = call.getParent(); up != null && !(up instanceof KtCatchClause)
        && !(up instanceof KtDeclarationWithBody); up = up.getParent()) {
      if (up instanceof KtCallExpression && reporting((KtCallExpression) up)) {
        return false;
      }
    }
    return true;
  }

  private boolean passesCaught(KtCallExpression call) {
    for (KtValueArgument argument : call.getValueArguments()) {
      KtExpression expression = KtPsiUtil.safeDeparenthesize(argument.getArgumentExpression());
      if (expression instanceof KtNameReferenceExpression
          && caught.equals(((KtNameReferenceExpression) expression).getReferencedName())) {
        return true;
      }
    }
    return false;
  }

  static boolean reporting(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    KtExpression receiver = receiverOf(call);
    if (STACK_TRACE.equals(name)) {
      return true;
    }
    if (CONSOLE.contains(name)) {
      return receiver == null ? !"format".equals(name) : CONSOLE_OWNERS.contains(receiver.getText());
    }
    String owner = receiver instanceof KtQualifiedExpression
        ? nameOf(((KtQualifiedExpression) receiver).getSelectorExpression()) : nameOf(receiver);
    return LOG_LEVELS.contains(name) && owner != null
        && LOGGER_NAMES.stream().anyMatch(pattern -> pattern.matcher(owner).find());
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    if (parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == call) {
      return ((KtQualifiedExpression) parent).getReceiverExpression();
    }
    return null;
  }
}
