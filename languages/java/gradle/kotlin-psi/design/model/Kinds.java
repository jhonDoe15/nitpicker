package nitpicker.kotlinpsi.design.model;

import java.util.Set;
import org.jetbrains.kotlin.psi.*;

public final class Kinds {
  private static final Set<String> VALUE_METHODS = Set.of("equals", "hashCode", "toString");

  private Kinds() {}

  public static String of(Owner owner) {
    if (owner.module()) {
      return "module";
    }
    if (owner.psi instanceof KtClass && ((KtClass) owner.psi).isInterface()) {
      return "interface";
    }
    if (!owner.cases.isEmpty() || owner.psi instanceof KtClass && ((KtClass) owner.psi).isEnum()) {
      return "enum";
    }
    if (owner.psi instanceof KtClass && ((KtClass) owner.psi).isData()) {
      return "data";
    }
    return behaviour(owner) ? "class" : "data";
  }

  public static boolean behaviour(Owner owner) {
    for (KtDeclaration declaration : owner.psi.getDeclarations()) {
      if (declaration instanceof KtNamedFunction && !VALUE_METHODS.contains(declaration.getName())) {
        return true;
      }
    }
    return false;
  }

  public static boolean valueLike(Owner owner) {
    String kind = of(owner);
    return kind.equals("class") || kind.equals("data");
  }

  public static boolean usable(Owner owner) {
    String kind = of(owner);
    return kind.equals("class") || kind.equals("data") || kind.equals("interface");
  }
}
