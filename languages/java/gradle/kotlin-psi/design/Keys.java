package nitpicker.kotlinpsi.design;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

final class Keys {
  private final Ctx ctx;
  private final Fun function;
  private final Map<String, Set<PsiElement>> declarations = new HashMap<>();
  private final Mutations mutations;

  Keys(Ctx ctx, Fun function, Mutations mutations) {
    this.ctx = ctx;
    this.function = function;
    this.mutations = mutations;
    for (KtParameter parameter : function.params) {
      declare(parameter.getName(), parameter);
    }
    for (PsiElement root : function.roots) {
      for (KtNamedDeclaration declaration : PsiTreeUtil.findChildrenOfType(root, KtNamedDeclaration.class)) {
        boolean local = declaration instanceof KtProperty && ((KtProperty) declaration).isLocal();
        if (local || declaration instanceof KtParameter || declaration instanceof KtDestructuringDeclarationEntry) {
          declare(declaration.getName(), declaration);
        }
      }
    }
  }

  private void declare(String name, PsiElement declaration) {
    if (name != null) {
      declarations.computeIfAbsent(name, key -> new HashSet<>()).add(declaration);
    }
  }

  String of(KtExpression expression) {
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
      return ref.getReferencedName() + "@" + ctx.sourceOf(declaration).line(declaration);
    }
    if (declaration instanceof KtProperty) {
      KtProperty property = (KtProperty) declaration;
      if (property.isVar() && mutations.reassigned(property)) {
        return null;
      }
      String alias = depth < 4 && property.getInitializer() != null ? aliasKey(property.getInitializer(), depth) : null;
      if (alias != null) {
        return alias;
      }
    }
    return unique(ref.getReferencedName(), declaration);
  }

  private KtExpression valueLambdaReceiver(PsiElement declaration) {
    if (declaration instanceof KtFunctionLiteral) {
      return ctx.typer.valueReceiver(declaration, null);
    }
    PsiElement list = declaration instanceof KtParameter ? declaration.getParent() : null;
    PsiElement literal = list == null ? null : list.getParent();
    return literal == null ? null : ctx.typer.valueReceiver(literal, (KtParameter) declaration);
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
    return name + "@" + ctx.sourceOf(declaration).line(declaration);
  }
}
