package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.nameOf;
import static nitpicker.kotlinpsi.common.Psi.withoutTypeArguments;

import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class ReceiverTypes {
  private static final int DEPTH = 4;
  private static final Map<String, String> RESULTS =
      Map.ofEntries(
          Map.entry("toFile", "java.io.File"),
          Map.entry("toPath", "java.nio.file.Path"),
          Map.entry("connection", "java.sql.Connection"),
          Map.entry("getConnection", "java.sql.Connection"),
          Map.entry("prepareStatement", "java.sql.PreparedStatement"),
          Map.entry("createStatement", "java.sql.Statement"),
          Map.entry("openConnection", "java.net.URLConnection"),
          Map.entry("submit", "java.util.concurrent.Future"),
          Map.entry("supplyAsync", "java.util.concurrent.Future"),
          Map.entry("runAsync", "java.util.concurrent.Future"),
          Map.entry("toFuture", "java.util.concurrent.Future"),
          Map.entry("newCall", "okhttp3.Call"));
  private static final Map<String, String> PATH_FACTORIES =
      Map.of("Paths", "java.nio.file.Path", "Path", "java.nio.file.Path");

  private ReceiverTypes() {}

  static String of(KtExpression expression) {
    return of(expression, 0);
  }

  private static String of(KtExpression expression, int depth) {
    if (expression == null || depth > DEPTH) {
      return null;
    }
    KtExpression target = KtPsiUtil.safeDeparenthesize(expression);
    if (target instanceof KtCallExpression call) {
      return ofCall(call, null);
    }
    if (target instanceof KtDotQualifiedExpression || target instanceof KtSafeQualifiedExpression) {
      return ofQualified((KtQualifiedExpression) target, depth);
    }
    if (target instanceof KtNameReferenceExpression name) {
      return ofName(name, depth);
    }
    return null;
  }

  private static String ofQualified(KtQualifiedExpression qualified, int depth) {
    KtExpression selector = qualified.getSelectorExpression();
    if (selector instanceof KtCallExpression call) {
      return ofCall(call, qualified.getReceiverExpression());
    }
    String property = nameOf(selector);
    if (property == null) {
      return null;
    }
    boolean typed = of(qualified.getReceiverExpression(), depth + 1) != null
        || qualified.getReceiverExpression() instanceof KtNameReferenceExpression;
    return typed ? RESULTS.get(property) : null;
  }

  private static String ofCall(KtCallExpression call, KtExpression receiver) {
    String name = nameOf(call.getCalleeExpression());
    if (name == null) {
      return null;
    }
    if (receiver == null) {
      return Character.isUpperCase(name.charAt(0)) ? name : null;
    }
    String owner = receiver instanceof KtNameReferenceExpression ref ? nameOf(ref) : null;
    if (owner != null && PATH_FACTORIES.containsKey(owner) && (name.equals("get") || name.equals("of"))) {
      return PATH_FACTORIES.get(owner);
    }
    return RESULTS.get(name);
  }

  private static String ofName(KtNameReferenceExpression reference, int depth) {
    String name = reference.getReferencedName();
    for (PsiElement scope = reference.getParent(); scope != null; scope = scope.getParent()) {
      if (scope instanceof KtFunctionLiteral literal && isElementParameter(literal, name)) {
        return elementOf(literal);
      }
      KtDeclaration found = declaration(scope, name, reference);
      if (found != null) {
        return declared(found, depth);
      }
    }
    return null;
  }

  private static KtDeclaration declaration(PsiElement scope, String name, PsiElement use) {
    if (scope instanceof KtFunction function) {
      for (KtParameter parameter : function.getValueParameters()) {
        if (name.equals(parameter.getName())) {
          return parameter;
        }
      }
    }
    if (scope instanceof KtBlockExpression block) {
      for (KtExpression statement : block.getStatements()) {
        if (statement.getTextOffset() >= use.getTextOffset()) {
          break;
        }
        if (statement instanceof KtProperty property && name.equals(property.getName())) {
          return property;
        }
      }
    }
    if (scope instanceof KtClassOrObject klass) {
      for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
        if (name.equals(parameter.getName())) {
          return parameter;
        }
      }
      for (KtDeclaration member : klass.getDeclarations()) {
        if (member instanceof KtProperty property && name.equals(property.getName())) {
          return property;
        }
      }
    }
    return null;
  }

  private static boolean isElementParameter(KtFunctionLiteral literal, String name) {
    List<KtParameter> parameters = literal.getValueParameters();
    if (parameters.isEmpty()) {
      return name.equals("it");
    }
    return parameters.size() == 1 && name.equals(parameters.get(0).getName())
        && parameters.get(0).getTypeReference() == null;
  }

  private static String elementOf(KtFunctionLiteral literal) {
    KtCallExpression host = literal.getParent() instanceof KtLambdaExpression lambda
        ? CoroutineScopes.hostOf(lambda) : null;
    KtExpression receiver = host == null ? null : CoroutineScopes.receiverOf(host);
    if (receiver == null || !(KtPsiUtil.safeDeparenthesize(receiver) instanceof KtNameReferenceExpression owner)
        || !InlineScopes.passesElement(nameOf(host.getCalleeExpression()))) {
      return null;
    }
    for (PsiElement scope = owner.getParent(); scope != null; scope = scope.getParent()) {
      KtDeclaration found = declaration(scope, owner.getReferencedName(), owner);
      if (found != null) {
        KtTypeReference type = found instanceof KtCallableDeclaration callable ? callable.getTypeReference() : null;
        return type == null ? null : InlineScopes.elementType(type.getText());
      }
    }
    return null;
  }

  private static String declared(KtDeclaration declaration, int depth) {
    KtTypeReference type = declaration instanceof KtCallableDeclaration callable ? callable.getTypeReference() : null;
    if (type != null) {
      return withoutTypeArguments(type.getText()).replace("?", "").trim();
    }
    if (declaration instanceof KtProperty property) {
      return of(property.getInitializer(), depth + 1);
    }
    return null;
  }
}
