package nitpicker.kotlinpsi.design;

import java.util.Set;
import org.jetbrains.kotlin.psi.*;

final class Entries {
  private static final Set<String> VALUE_METHODS = Set.of("toString", "equals", "hashCode");

  private Entries() {}

  static boolean of(Ctx ctx, Fun function) {
    Owner owner = function.owner;
    if (function.constructor()) {
      return owner.psi != null && !owner.psi.getAnnotationEntries().isEmpty();
    }
    if (function.isOverride) {
      return !VALUE_METHODS.contains(function.name);
    }
    if (annotated(function)) {
      return true;
    }
    if ("main".equals(function.name) && (owner.module() || owner.psi instanceof KtObjectDeclaration)) {
      return true;
    }
    return !owner.module() && ctx.hierarchy.external(owner) && !VALUE_METHODS.contains(function.name);
  }

  private static boolean annotated(Fun function) {
    if (function.psi instanceof KtAnnotated && !((KtAnnotated) function.psi).getAnnotationEntries().isEmpty()) {
      return true;
    }
    return function.psi instanceof KtPropertyAccessor
        && !((KtPropertyAccessor) function.psi).getProperty().getAnnotationEntries().isEmpty();
  }
}
