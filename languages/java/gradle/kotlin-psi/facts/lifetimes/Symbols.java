package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Symbols {
  record Declaration(PsiElement element, String type) {}

  private Symbols() {}

  static Declaration resolve(KtNameReferenceExpression reference) {
    String name = reference.getReferencedName();
    PsiElement child = reference;
    for (PsiElement parent = reference.getParent(); parent != null; parent = parent.getParent()) {
      Declaration found = declaredIn(parent, child, name);
      if (found != null) {
        return found;
      }
      child = parent;
    }
    return null;
  }

  private static Declaration declaredIn(PsiElement scope, PsiElement before, String name) {
    if (scope instanceof KtBlockExpression) {
      return localProperty((KtBlockExpression) scope, before, name);
    }
    if (scope instanceof KtFunctionLiteral) {
      return parameter(((KtFunctionLiteral) scope).getValueParameters(), name);
    }
    if (scope instanceof KtNamedFunction) {
      return parameter(((KtNamedFunction) scope).getValueParameters(), name);
    }
    if (scope instanceof KtForExpression) {
      KtParameter loop = ((KtForExpression) scope).getLoopParameter();
      return loop != null && name.equals(loop.getName()) ? new Declaration(loop, null) : null;
    }
    if (scope instanceof KtClassOrObject) {
      return member((KtClassOrObject) scope, name);
    }
    if (scope instanceof KtFile) {
      return declarations(((KtFile) scope).getDeclarations(), name);
    }
    return null;
  }

  private static Declaration localProperty(KtBlockExpression block, PsiElement before, String name) {
    Declaration found = null;
    for (KtExpression statement : block.getStatements()) {
      if (statement == before || statement.getTextOffset() >= before.getTextOffset()) {
        break;
      }
      if (statement instanceof KtProperty && name.equals(((KtProperty) statement).getName())) {
        found = new Declaration(statement, typeOf((KtProperty) statement));
      }
    }
    return found;
  }

  private static Declaration parameter(List<KtParameter> parameters, String name) {
    for (KtParameter parameter : parameters) {
      if (name.equals(parameter.getName())) {
        return new Declaration(parameter, typeText(parameter.getTypeReference()));
      }
    }
    return null;
  }

  private static Declaration member(KtClassOrObject klass, String name) {
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      if (parameter.hasValOrVar() && name.equals(parameter.getName())) {
        return new Declaration(parameter, typeText(parameter.getTypeReference()));
      }
    }
    return declarations(klass.getDeclarations(), name);
  }

  private static Declaration declarations(List<KtDeclaration> declarations, String name) {
    for (KtDeclaration declaration : declarations) {
      if (declaration instanceof KtProperty && name.equals(declaration.getName())) {
        return new Declaration(declaration, typeOf((KtProperty) declaration));
      }
    }
    return null;
  }

  static String typeOf(KtProperty property) {
    if (property.getTypeReference() != null) {
      return typeText(property.getTypeReference());
    }
    KtExpression initializer = property.getInitializer();
    if (initializer instanceof KtQualifiedExpression) {
      initializer = ((KtQualifiedExpression) initializer).getSelectorExpression();
    }
    return initializer instanceof KtCallExpression
        ? calleeType((KtCallExpression) initializer)
        : null;
  }

  static String calleeType(KtCallExpression call) {
    String name = nameOf(call.getCalleeExpression());
    return name == null ? null : "call:" + name;
  }

  private static String typeText(KtTypeReference reference) {
    if (reference == null) {
      return null;
    }
    String text = reference.getText().replaceAll("\\s+", "");
    int generic = text.indexOf('<');
    text = generic < 0 ? text : text.substring(0, generic);
    return text.endsWith("?") ? text.substring(0, text.length() - 1) : text;
  }
}
