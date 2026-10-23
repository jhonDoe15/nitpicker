package nitpicker.kotlinpsi.design.resolve;

import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;

public final class Binding {
  public static final Binding UNKNOWN = new Binding(Kind.UNKNOWN, null, null, null, false, false);

  public enum Kind {
    LOCAL,
    FIELD,
    TYPE,
    UNKNOWN
  }

  public final Kind kind;
  public final PsiElement declaration;
  public final Prop prop;
  public final Owner owner;
  public final boolean thisField;
  public final boolean receiver;

  private Binding(Kind kind, PsiElement declaration, Prop prop, Owner owner, boolean thisField, boolean receiver) {
    this.kind = kind;
    this.declaration = declaration;
    this.prop = prop;
    this.owner = owner;
    this.thisField = thisField;
    this.receiver = receiver;
  }

  public static Binding local(PsiElement declaration) {
    return new Binding(Kind.LOCAL, declaration, null, null, false, false);
  }

  public static Binding field(Prop prop, boolean thisField) {
    return new Binding(Kind.FIELD, null, prop, null, thisField, false);
  }

  public static Binding receiverField(Prop prop) {
    return new Binding(Kind.FIELD, null, prop, null, false, true);
  }

  public static Binding type(Owner owner) {
    return new Binding(Kind.TYPE, null, null, owner, false, false);
  }
}
