package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Throwing {
  private static final Set<String> FAILING = Set.of("error", "TODO", "exitProcess");
  private static final Set<String> ASSERTION_FAILURES = Set.of("fail", "failBecauseExceptionWasNotThrown");
  private static final Set<String> ASSERTION_OWNERS =
      Set.of(
          "kotlin.test", "org.junit.jupiter.api", "org.junit.jupiter.api.Assertions", "org.junit.Assert",
          "org.assertj.core.api.Assertions", "org.assertj.core.api.Fail");

  private final Set<String> nothing;
  private final Map<String, String> imported = new HashMap<>();
  private final Set<String> wildcards = new HashSet<>();

  public Throwing(Set<String> nothing, KtFile file) {
    this.nothing = nothing;
    for (KtImportDirective directive : file.getImportDirectives()) {
      var path = directive.getImportPath();
      if (path == null) {
        continue;
      }
      String full = path.getFqName().asString();
      if (path.isAllUnder()) {
        wildcards.add(full);
      } else {
        imported.put(path.getAlias() == null ? simpleName(full) : path.getAlias().asString(), full);
      }
    }
  }

  public static Set<String> nothingFunctions(List<KtFile> files) {
    Set<String> names = new HashSet<>();
    for (KtFile file : files) {
      for (KtNamedFunction function : PsiTreeUtil.collectElementsOfType(file, KtNamedFunction.class)) {
        KtTypeReference type = function.getTypeReference();
        if (type != null && "Nothing".equals(type.getText().trim()) && function.getName() != null) {
          names.add(function.getName());
        }
      }
    }
    return names;
  }

  public boolean fails(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return false;
    }
    PsiElement parent = call.getParent();
    if (parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == call) {
      String owner = ((KtQualifiedExpression) parent).getReceiverExpression().getText();
      return ASSERTION_FAILURES.contains(name)
          && ASSERTION_OWNERS.stream().anyMatch(full -> full.equals(owner) || full.endsWith("." + owner));
    }
    String full = imported.get(name);
    if (full != null) {
      String simple = simpleName(full);
      String owner = full.substring(0, Math.max(full.lastIndexOf('.'), 0));
      return ASSERTION_FAILURES.contains(simple) && ASSERTION_OWNERS.contains(owner)
          || FAILING.contains(simple) && owner.startsWith("kotlin")
          || nothing.contains(simple);
    }
    return FAILING.contains(name) || nothing.contains(name)
        || ASSERTION_FAILURES.contains(name) && wildcards.stream().anyMatch(ASSERTION_OWNERS::contains);
  }

  private static String simpleName(String full) {
    return full.substring(full.lastIndexOf('.') + 1);
  }

  boolean throwsIn(PsiElement body) {
    if (body == null) {
      return false;
    }
    if (PsiTreeUtil.findChildOfType(body, KtThrowExpression.class) != null || body instanceof KtThrowExpression) {
      return true;
    }
    for (KtCallExpression call : PsiTreeUtil.collectElementsOfType(body, KtCallExpression.class)) {
      if (fails(call)) {
        return true;
      }
    }
    return false;
  }

  boolean lambdaThrows(KtCallExpression call) {
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression instanceof KtLambdaExpression && throwsIn(((KtLambdaExpression) expression).getBodyExpression())) {
        return true;
      }
    }
    return false;
  }
}
