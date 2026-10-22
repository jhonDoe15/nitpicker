package nitpicker.kotlinpsi.design;

import org.jetbrains.kotlin.com.intellij.psi.PsiElement;

final class Binding {
  static final Binding UNKNOWN = new Binding(Kind.UNKNOWN, null, null, null, false, false);

  enum Kind {
    LOCAL,
    FIELD,
    TYPE,
    UNKNOWN
  }

  final Kind kind;
  final PsiElement declaration;
  final Prop prop;
  final Owner owner;
  final boolean thisField;
  final boolean receiver;

  private Binding(Kind kind, PsiElement declaration, Prop prop, Owner owner, boolean thisField, boolean receiver) {
    this.kind = kind;
    this.declaration = declaration;
    this.prop = prop;
    this.owner = owner;
    this.thisField = thisField;
    this.receiver = receiver;
  }

  static Binding local(PsiElement declaration) {
    return new Binding(Kind.LOCAL, declaration, null, null, false, false);
  }

  static Binding field(Prop prop, boolean thisField) {
    return new Binding(Kind.FIELD, null, prop, null, thisField, false);
  }

  static Binding receiverField(Prop prop) {
    return new Binding(Kind.FIELD, null, prop, null, false, true);
  }

  static Binding type(Owner owner) {
    return new Binding(Kind.TYPE, null, null, owner, false, false);
  }
}
