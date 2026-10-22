package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.KtDeclaration;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtTypeReference;

final class Fun {
  static final String FUNCTION = "function";
  static final String METHOD = "method";
  static final String CONSTRUCTOR = "constructor";
  static final String ACCESSOR = "accessor";

  final String name;
  final Owner owner;
  final String kind;
  final KtDeclaration psi;
  final List<KtParameter> params;
  final KtTypeReference receiver;
  final KtTypeReference returns;
  final boolean isPrivate;
  final boolean isOverride;
  final boolean hasBody;
  final List<PsiElement> roots = new ArrayList<>();
  Prop property;
  String returnsField;
  String id;

  Fun(String name, Owner owner, String kind, KtDeclaration psi, Shape shape) {
    this.name = name;
    this.owner = owner;
    this.kind = kind;
    this.psi = psi;
    this.params = shape.params;
    this.receiver = shape.receiver;
    this.returns = shape.returns;
    this.isPrivate = shape.isPrivate;
    this.isOverride = shape.isOverride;
    this.hasBody = shape.hasBody;
  }

  boolean constructor() {
    return CONSTRUCTOR.equals(kind);
  }

  static final class Shape {
    List<KtParameter> params = List.of();
    KtTypeReference receiver;
    KtTypeReference returns;
    boolean isPrivate;
    boolean isOverride;
    boolean hasBody;
  }
}
