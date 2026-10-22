package nitpicker.kotlinpsi.facts.lifetimes;

import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;
import org.jetbrains.kotlin.resolve.ImportPath;

final class Shields {
  private static final String NAME = "NonCancellable";
  private final Set<String> names = Hosts.names(NAME);

  Shields(KtFile file) {
    for (KtImportDirective directive : file.getImportDirectives()) {
      ImportPath path = directive.getImportPath();
      if (path != null && !path.isAllUnder() && path.getAlias() != null
          && path.getFqName().shortName().asString().equals(NAME)) {
        names.add(path.getAlias().asString());
      }
    }
  }

  boolean shields(KtCallExpression call) {
    if (Hosts.lambdas(call).isEmpty()) {
      return false;
    }
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      if (expression != null && !(expression instanceof KtLambdaExpression)
          && Hosts.mentions(expression, names)) {
        return true;
      }
    }
    return false;
  }

  boolean inside(PsiElement element) {
    for (PsiElement parent = element.getParent(); parent != null; parent = parent.getParent()) {
      if (Hosts.isBoundary(parent)) {
        return false;
      }
      if (parent instanceof KtLambdaExpression) {
        KtCallExpression host = Hosts.of((KtLambdaExpression) parent);
        if (host != null && shields(host)) {
          return true;
        }
      }
    }
    return false;
  }
}
