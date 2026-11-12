package nitpicker.kotlinpsi.design.lookup;

import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Elements {
  private static final Set<String> COLLECTIONS =
      Set.of(
          "List", "MutableList", "Set", "MutableSet", "Collection", "MutableCollection", "Iterable",
          "MutableIterable", "Sequence", "ArrayList", "LinkedList", "HashSet", "LinkedHashSet", "TreeSet",
          "ArrayDeque", "Array");

  private final Ctx ctx;

  public Elements(Ctx ctx) {
    this.ctx = ctx;
  }

  public Ty of(KtExpression collection) {
    KtTypeReference element = element(Ps.strip(collection));
    return element == null ? Ty.UNKNOWN : ctx.names.resolve(element, ctx.sourceOf(collection));
  }

  private KtTypeReference element(KtExpression collection) {
    if (!(collection instanceof KtNameReferenceExpression)) {
      return null;
    }
    Binding binding = ctx.bindings.bind((KtNameReferenceExpression) collection);
    if (binding.kind == Binding.Kind.LOCAL) {
      return fromDeclaration(binding.declaration);
    }
    return binding.kind == Binding.Kind.FIELD && !binding.receiver ? fromDeclaration(binding.prop.psi) : null;
  }

  private KtTypeReference fromDeclaration(PsiElement declaration) {
    if (declaration instanceof KtProperty) {
      KtProperty property = (KtProperty) declaration;
      return property.getTypeReference() != null ? argument(property.getTypeReference()) : created(property);
    }
    return declaration instanceof KtParameter ? argument(((KtParameter) declaration).getTypeReference()) : null;
  }

  private KtTypeReference argument(KtTypeReference declared) {
    KtTypeElement element = declared == null ? null : declared.getTypeElement();
    if (element instanceof KtNullableType) {
      element = ((KtNullableType) element).getInnerType();
    }
    if (!(element instanceof KtUserType)) {
      return null;
    }
    KtUserType type = (KtUserType) element;
    String name = type.getReferencedName();
    List<KtTypeProjection> arguments = type.getTypeArguments();
    boolean single = name != null && COLLECTIONS.contains(name) && arguments.size() == 1;
    return single ? arguments.get(0).getTypeReference() : null;
  }

  private KtTypeReference created(KtProperty property) {
    KtExpression initializer = Ps.parens(property.getInitializer());
    if (!(initializer instanceof KtCallExpression)) {
      return null;
    }
    List<KtTypeProjection> arguments = ((KtCallExpression) initializer).getTypeArguments();
    return arguments.size() == 1 ? arguments.get(0).getTypeReference() : null;
  }
}
