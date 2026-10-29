package nitpicker.kotlinpsi.design.model;

import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtNamedDeclaration;
import org.jetbrains.kotlin.psi.KtTypeReference;

public final class Prop {
  public final String name;
  public final Owner owner;
  public final KtNamedDeclaration psi;
  public final KtTypeReference type;
  public final KtExpression init;
  public final boolean isVar;
  public final boolean isPrivate;
  public final boolean isProtected;
  public final boolean field;
  public final boolean delegated;
  public final boolean constructorParameter;
  public Fun getter;

  public Prop(Owner owner, KtNamedDeclaration psi, Shape shape) {
    this.name = psi.getName();
    this.owner = owner;
    this.psi = psi;
    this.type = shape.type;
    this.init = shape.init;
    this.isVar = shape.isVar;
    this.isPrivate = shape.isPrivate;
    this.isProtected = shape.isProtected;
    this.field = shape.field;
    this.delegated = shape.delegated;
    this.constructorParameter = shape.constructorParameter;
  }

  public boolean hidden() {
    return isPrivate || isProtected;
  }

  public static final class Shape {
    public KtTypeReference type;
    public KtExpression init;
    public boolean isVar;
    public boolean isPrivate;
    public boolean isProtected;
    public boolean field;
    public boolean delegated;
    public boolean constructorParameter;
  }
}
