package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;
import org.jetbrains.kotlin.resolve.ImportPath;

final class Hosts {
  private Hosts() {}

  static boolean isWrapper(PsiElement element) {
    return element instanceof KtLabeledExpression
        || element instanceof KtAnnotatedExpression
        || element instanceof KtParenthesizedExpression;
  }

  static PsiElement outermost(PsiElement element) {
    PsiElement current = element;
    while (isWrapper(current.getParent())) {
      current = current.getParent();
    }
    return current;
  }

  static KtCallExpression of(KtLambdaExpression lambda) {
    PsiElement parent = outermost(lambda).getParent();
    PsiElement call =
        parent instanceof KtLambdaArgument
            ? parent.getParent()
            : parent instanceof KtValueArgument && parent.getParent() != null
                ? parent.getParent().getParent()
                : null;
    return call instanceof KtCallExpression ? (KtCallExpression) call : null;
  }

  static String nameOfHost(KtLambdaExpression lambda) {
    KtCallExpression call = of(lambda);
    return call == null ? null : nameOf(call.getCalleeExpression());
  }

  static List<KtLambdaExpression> lambdas(KtCallExpression call) {
    List<KtLambdaExpression> lambdas = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = unwrap(argument.getArgumentExpression());
      if (expression instanceof KtLambdaExpression) {
        lambdas.add((KtLambdaExpression) expression);
      }
    }
    return lambdas;
  }

  static KtExpression unwrap(KtExpression expression) {
    return expression == null ? null : KtPsiUtil.deparenthesize(expression);
  }

  static KtExpression receiverOf(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression
            && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        ? ((KtQualifiedExpression) parent).getReceiverExpression()
        : null;
  }

  static Set<String> names(String... names) {
    return new HashSet<>(Arrays.asList(names));
  }

  static Set<String> aliases(KtFile file, String... declared) {
    Set<String> found = names(declared);
    Set<String> real = names(declared);
    for (KtImportDirective directive : file.getImportDirectives()) {
      ImportPath path = directive.getImportPath();
      if (path != null && !path.isAllUnder() && path.getAlias() != null
          && real.contains(path.getFqName().shortName().asString())) {
        found.add(path.getAlias().asString());
      }
    }
    return found;
  }

  static KtClassOrObject classOf(PsiElement element) {
    PsiElement current = element.getParent();
    while (current != null && !(current instanceof KtClassOrObject)) {
      current = current.getParent();
    }
    return (KtClassOrObject) current;
  }

  static boolean isBoundary(PsiElement element) {
    return element instanceof KtNamedFunction
        || element instanceof KtClassOrObject
        || element instanceof KtFile
        || element instanceof KtPropertyAccessor
        || element instanceof KtSecondaryConstructor;
  }

  static boolean mentions(PsiElement element, Set<String> names) {
    if (element instanceof KtNameReferenceExpression
        && names.contains(((KtNameReferenceExpression) element).getReferencedName())) {
      return true;
    }
    for (PsiElement child : element.getChildren()) {
      if (mentions(child, names)) {
        return true;
      }
    }
    return false;
  }
}
