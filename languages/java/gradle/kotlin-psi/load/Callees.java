package nitpicker.kotlinpsi.load;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Callees {
  private Callees() {}

  static KtNamedFunction resolve(KtCallExpression call, String name) {
    for (PsiElement e = call.getParent(); e != null; e = e.getParent()) {
      if (e instanceof KtClassOrObject) {
        KtNamedFunction found = among(declarationsOf((KtClassOrObject) e), call, name);
        if (found != null) {
          return found;
        }
      }
    }
    return among(call.getContainingKtFile().getDeclarations(), call, name);
  }

  private static List<KtDeclaration> declarationsOf(KtClassOrObject owner) {
    List<KtDeclaration> declarations = new ArrayList<>(owner.getDeclarations());
    if (owner instanceof KtClass) {
      for (KtObjectDeclaration companion : ((KtClass) owner).getCompanionObjects()) {
        declarations.addAll(companion.getDeclarations());
      }
    }
    return declarations;
  }

  private static KtNamedFunction among(List<KtDeclaration> declarations, KtCallExpression call, String name) {
    for (KtDeclaration declaration : declarations) {
      if (declaration instanceof KtNamedFunction && name.equals(declaration.getName())
          && ((KtNamedFunction) declaration).getReceiverTypeReference() == null
          && Fits.fits(call.getValueArguments(), ((KtNamedFunction) declaration).getValueParameters())) {
        return (KtNamedFunction) declaration;
      }
    }
    return null;
  }
}
