package nitpicker.kotlinpsi.design;

import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtNamedDeclaration;
import org.jetbrains.kotlin.psi.KtTypeReference;

final class Prop {
  final String name;
  final Owner owner;
  final KtNamedDeclaration psi;
  final KtTypeReference type;
  final KtExpression init;
  final boolean isVar;
  final boolean isPrivate;
  final boolean field;
  final boolean delegated;
  final boolean constructorParameter;
  Fun getter;

  Prop(String name, Owner owner, KtNamedDeclaration psi, Shape shape) {
    this.name = name;
    this.owner = owner;
    this.psi = psi;
    this.type = shape.type;
    this.init = shape.init;
    this.isVar = shape.isVar;
    this.isPrivate = shape.isPrivate;
    this.field = shape.field;
    this.delegated = shape.delegated;
    this.constructorParameter = shape.constructorParameter;
  }

  static final class Shape {
    KtTypeReference type;
    KtExpression init;
    boolean isVar;
    boolean isPrivate;
    boolean field;
    boolean delegated;
    boolean constructorParameter;
  }
}
