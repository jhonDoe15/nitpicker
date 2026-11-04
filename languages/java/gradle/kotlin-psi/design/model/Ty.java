package nitpicker.kotlinpsi.design.model;

import org.jetbrains.kotlin.KtNodeTypes;
import org.jetbrains.kotlin.psi.KtConstantExpression;

public final class Ty {
  public static final Ty UNKNOWN = new Ty(null, null);

  public final Owner owner;
  public final String text;

  private Ty(Owner owner, String text) {
    this.owner = owner;
    this.text = text;
  }

  public static Ty of(Owner owner) {
    return owner == null ? UNKNOWN : new Ty(owner, null);
  }

  public static Ty text(String text) {
    return text == null || text.isEmpty() ? UNKNOWN : new Ty(null, text);
  }

  public static Ty ofConstant(KtConstantExpression e) {
    Object type = e.getNode().getElementType();
    if (type == KtNodeTypes.INTEGER_CONSTANT) {
      return text("Int");
    }
    if (type == KtNodeTypes.FLOAT_CONSTANT) {
      return text("Double");
    }
    if (type == KtNodeTypes.BOOLEAN_CONSTANT) {
      return text("Boolean");
    }
    return type == KtNodeTypes.CHARACTER_CONSTANT ? text("Char") : UNKNOWN;
  }

  public boolean project() {
    return owner != null;
  }

  public boolean known() {
    return owner != null || text != null;
  }

  public String normalized() {
    if (owner != null) {
      return owner.listed ? owner.id : owner.name;
    }
    return text;
  }
}
