package nitpicker.kotlinpsi.load;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

final class Creations {
  private Creations() {}

  static List<List<? extends ValueArgument>> of(KtClass type) {
    List<List<? extends ValueArgument>> found = new ArrayList<>();
    if (type.isEnum()) {
      for (KtDeclaration declaration : type.getDeclarations()) {
        if (declaration instanceof KtEnumEntry) {
          found.add(entryArguments((KtEnumEntry) declaration));
        }
      }
      return found;
    }
    for (KtObjectDeclaration companion : type.getCompanionObjects()) {
      for (KtDeclaration inner : companion.getDeclarations()) {
        if (inner instanceof KtProperty || inner instanceof KtClassInitializer) {
          collect(type, inner, companion, found);
        }
      }
    }
    return found;
  }

  static boolean reaches(List<List<? extends ValueArgument>> created, KtSecondaryConstructor constructor) {
    if (created.stream().anyMatch(arguments -> selects(arguments, constructor))) {
      return true;
    }
    for (KtSecondaryConstructor other : constructor.getContainingClassOrObject().getSecondaryConstructors()) {
      KtConstructorDelegationCall delegation = other.getDelegationCall();
      if (other != constructor && delegation.isCallToThis()
          && created.stream().anyMatch(arguments -> selects(arguments, other))
          && Fits.fits(delegation.getValueArguments(), constructor.getValueParameters())) {
        return true;
      }
    }
    return false;
  }

  private static boolean selects(List<? extends ValueArgument> arguments, KtSecondaryConstructor constructor) {
    KtPrimaryConstructor primary = constructor.getContainingClassOrObject().getPrimaryConstructor();
    return Fits.fits(arguments, constructor.getValueParameters())
        && (primary == null || !Fits.fits(arguments, primary.getValueParameters()));
  }

  private static List<? extends ValueArgument> entryArguments(KtEnumEntry entry) {
    KtInitializerList initializers = entry.getInitializerList();
    if (initializers == null) {
      return List.of();
    }
    for (KtSuperTypeListEntry initializer : initializers.getInitializers()) {
      if (initializer instanceof KtSuperTypeCallEntry) {
        return ((KtSuperTypeCallEntry) initializer).getValueArguments();
      }
    }
    return List.of();
  }

  private static void collect(KtClass type, PsiElement scope, KtObjectDeclaration companion,
      List<List<? extends ValueArgument>> found) {
    for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(scope, KtCallExpression.class)) {
      String name = nameOf(call.getCalleeExpression());
      if (name == null || LoadTime.hasReceiver(call) || LoadTime.deferredBetween(call, scope)) {
        continue;
      }
      if (name.equals(type.getName())) {
        found.add(call.getValueArguments());
      } else if (companion != null) {
        for (KtNamedFunction factory : factories(companion, call, name)) {
          collect(type, factory, null, found);
        }
      }
    }
  }

  private static List<KtNamedFunction> factories(KtObjectDeclaration companion, KtCallExpression call, String name) {
    List<KtNamedFunction> factories = new ArrayList<>();
    for (KtDeclaration declaration : companion.getDeclarations()) {
      if (declaration instanceof KtNamedFunction && name.equals(declaration.getName())
          && Fits.fits(call.getValueArguments(), ((KtNamedFunction) declaration).getValueParameters())) {
        factories.add((KtNamedFunction) declaration);
      }
    }
    return factories;
  }
}
