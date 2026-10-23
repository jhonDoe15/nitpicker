package nitpicker.kotlinpsi.design.model;

import java.util.ArrayList;
import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.KtDeclaration;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtTypeReference;

public final class Fun {
  public static final String FUNCTION = "function";
  public static final String METHOD = "method";
  public static final String CONSTRUCTOR = "constructor";
  public static final String ACCESSOR = "accessor";

  public final String name;
  public final Owner owner;
  public final String kind;
  public final KtDeclaration psi;
  public final List<KtParameter> params;
  public final KtTypeReference receiver;
  public final KtTypeReference returns;
  public final boolean isPrivate;
  public final boolean isOverride;
  public final boolean hasBody;
  public final List<PsiElement> roots = new ArrayList<>();
  public Prop property;
  public String returnsField;
  public String id;

  public Fun(Owner owner, KtDeclaration psi, Shape shape) {
    this.name = shape.name;
    this.owner = owner;
    this.kind = shape.kind;
    this.psi = psi;
    this.params = shape.params;
    this.receiver = shape.receiver;
    this.returns = shape.returns;
    this.isPrivate = shape.isPrivate;
    this.isOverride = shape.isOverride;
    this.hasBody = shape.hasBody;
  }

  public boolean constructor() {
    return CONSTRUCTOR.equals(kind);
  }

  public static final class Shape {
    public String name;
    public String kind;
    public List<KtParameter> params = List.of();
    public KtTypeReference receiver;
    public KtTypeReference returns;
    public boolean isPrivate;
    public boolean isOverride;
    public boolean hasBody;

    public Shape named(String name, String kind) {
      this.name = name;
      this.kind = kind;
      return this;
    }
  }
}
