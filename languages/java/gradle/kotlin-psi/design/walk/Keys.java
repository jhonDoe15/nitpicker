package nitpicker.kotlinpsi.design.walk;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Keys {
  private final Ctx ctx;
  private final Fun function;
  private final Map<String, Set<PsiElement>> declarations = new HashMap<>();
  private final List<PsiElement> literals = new ArrayList<>();
  private final Mutations mutations;

  public Keys(Ctx ctx, Fun function, Mutations mutations) {
    this.ctx = ctx;
    this.function = function;
    this.mutations = mutations;
    for (KtParameter parameter : function.params) {
      declare(parameter.getName(), parameter);
    }
    for (PsiElement root : function.roots) {
      declareLocals(root);
      literals.addAll(PsiTreeUtil.findChildrenOfType(root, KtFunctionLiteral.class));
    }
  }

  private void declareLocals(PsiElement root) {
    for (KtNamedDeclaration declaration : PsiTreeUtil.findChildrenOfType(root, KtNamedDeclaration.class)) {
      boolean local = declaration instanceof KtProperty && ((KtProperty) declaration).isLocal();
      if (local || declaration instanceof KtParameter || declaration instanceof KtDestructuringDeclarationEntry) {
        declare(declaration.getName(), declaration);
      }
    }
  }

  private void declare(String name, PsiElement declaration) {
    if (name != null) {
      declarations.computeIfAbsent(name, key -> new LinkedHashSet<>()).add(declaration);
    }
  }

  public String of(KtExpression expression) {
    return of(expression, 0);
  }

  private String of(KtExpression expression, int depth) {
    KtExpression e = Ps.strip(expression);
    if (e instanceof KtThisExpression) {
      return thisKey((KtThisExpression) e);
    }
    if (e instanceof KtNameReferenceExpression) {
      return nameKey((KtNameReferenceExpression) e, depth);
    }
    if (e instanceof KtDotQualifiedExpression) {
      KtDotQualifiedExpression q = (KtDotQualifiedExpression) e;
      KtExpression receiver = Ps.strip(q.getReceiverExpression());
      if (receiver instanceof KtThisExpression && thisKey((KtThisExpression) receiver) != null
          && q.getSelectorExpression() instanceof KtNameReferenceExpression) {
        return fieldKey(ctx.bindings.bind((KtNameReferenceExpression) q.getSelectorExpression()));
      }
    }
    return null;
  }

  private String thisKey(KtThisExpression e) {
    Ty type = ctx.typer.typeOf(e);
    boolean own = type.project() && (type.owner == function.owner);
    boolean extension = function.receiver != null && type.known();
    return own || extension ? "this" : null;
  }

  private String nameKey(KtNameReferenceExpression ref, int depth) {
    Binding binding = ctx.bindings.bind(ref);
    if (binding.kind == Binding.Kind.FIELD) {
      return fieldKey(binding);
    }
    if (binding.kind != Binding.Kind.LOCAL) {
      return null;
    }
    PsiElement declaration = binding.declaration;
    KtExpression receiver = valueLambdaReceiver(declaration);
    if (receiver != null) {
      return of(receiver, depth + 1);
    }
    if (declaration instanceof KtFunctionLiteral) {
      return ref.getReferencedName() + "@" + (literals.indexOf(declaration) + 1);
    }
    if (declaration instanceof KtProperty) {
      return propertyKey(ref, (KtProperty) declaration, depth);
    }
    return unique(ref.getReferencedName(), declaration);
  }

  private String propertyKey(KtNameReferenceExpression ref, KtProperty property, int depth) {
    if (property.isVar() && mutations.reassigned(property)) {
      return null;
    }
    String alias = depth < 4 && property.getInitializer() != null ? aliasKey(property.getInitializer(), depth) : null;
    return alias != null ? alias : unique(ref.getReferencedName(), property);
  }

  private KtExpression valueLambdaReceiver(PsiElement declaration) {
    if (declaration instanceof KtFunctionLiteral) {
      return ctx.lambdas.valueReceiver(declaration, null);
    }
    PsiElement list = declaration instanceof KtParameter ? declaration.getParent() : null;
    PsiElement literal = list == null ? null : list.getParent();
    return literal == null ? null : ctx.lambdas.valueReceiver(literal, (KtParameter) declaration);
  }

  private String aliasKey(KtExpression initializer, int depth) {
    KtExpression e = Ps.strip(initializer);
    boolean simple = e instanceof KtNameReferenceExpression || e instanceof KtDotQualifiedExpression;
    return simple ? of(e, depth + 1) : null;
  }

  private String fieldKey(Binding binding) {
    if (binding.kind != Binding.Kind.FIELD || binding.receiver) {
      return null;
    }
    Owner owner = binding.prop.owner;
    if (owner.module()) {
      return binding.prop.name;
    }
    return owner == function.owner && binding.thisField ? "this." + binding.prop.name : null;
  }

  private String unique(String name, PsiElement declaration) {
    Set<PsiElement> all = declarations.getOrDefault(name, Set.of());
    if (all.size() <= 1) {
      return name;
    }
    return name + "@" + (new ArrayList<>(all).indexOf(declaration) + 1);
  }
}
