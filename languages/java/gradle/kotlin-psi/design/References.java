package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

/**
 * Project callables used as values: {@code ::foo} and {@code Foo::bar}, resolved by name when exactly one
 * callable fits, and the tables ({@code val} of a file or companion) that hold such references.
 */
final class References {
  private final Ctx ctx;
  private final Map<Prop, Set<Fun>> tables = new IdentityHashMap<>();

  References(Ctx ctx) {
    this.ctx = ctx;
  }

  Fun function(KtCallableReferenceExpression reference) {
    String name = reference.getCallableReference().getReferencedName();
    KtExpression receiver = reference.getReceiverExpression();
    if (receiver == null) {
      return bare(reference, name);
    }
    Owner type = ctx.typer.staticOwner(receiver);
    if (type != null) {
      return only(ctx.members.funs(type, name));
    }
    Ty typed = ctx.typer.typeOf(receiver);
    return typed.project() ? only(ctx.members.funs(typed.owner, name)) : null;
  }

  Set<Fun> table(Prop prop) {
    boolean held = prop.owner.module() || prop.owner.psi instanceof KtObjectDeclaration
        && ((KtObjectDeclaration) prop.owner.psi).isCompanion();
    if (!held || prop.isVar || initializer(prop) == null) {
      return Set.of();
    }
    Set<Fun> known = tables.get(prop);
    if (known == null) {
      known = new LinkedHashSet<>();
      collect(initializer(prop), known, false);
      tables.put(prop, known);
    }
    return known;
  }

  Set<Fun> initializers(Owner module) {
    Set<Fun> found = new LinkedHashSet<>();
    for (Prop prop : module.props.values()) {
      if (initializer(prop) != null) {
        collect(initializer(prop), found, true);
      }
    }
    return found;
  }

  private static KtExpression initializer(Prop prop) {
    if (prop.init != null) {
      return prop.init;
    }
    return prop.psi instanceof KtProperty ? ((KtProperty) prop.psi).getDelegateExpression() : null;
  }

  private void collect(KtExpression root, Set<Fun> out, boolean withCalls) {
    for (KtCallableReferenceExpression reference : within(root, KtCallableReferenceExpression.class)) {
      add(out, function(reference));
    }
    if (withCalls) {
      for (KtCallExpression call : within(root, KtCallExpression.class)) {
        add(out, ctx.calls.target(call));
      }
    }
  }

  private static <T extends PsiElement> List<T> within(PsiElement root, Class<T> type) {
    List<T> found = new ArrayList<>(PsiTreeUtil.findChildrenOfType(root, type));
    if (type.isInstance(root)) {
      found.add(0, type.cast(root));
    }
    return found;
  }

  private static void add(Set<Fun> out, Fun function) {
    if (function != null && function.owner.listed) {
      out.add(function);
    }
  }

  private Fun bare(KtCallableReferenceExpression reference, String name) {
    if (shadowed(reference, name)) {
      return null;
    }
    Source source = ctx.sourceOf(reference);
    List<Fun> plain = ctx.calls.plainTopLevel(name, source);
    Owner type = ctx.names.lookup(name, reference, source);
    if (type != null && !type.module() && ctx.typer.constructible(type)) {
      return plain.isEmpty() ? only(type.constructors) : null;
    }
    return only(plain);
  }

  private boolean shadowed(PsiElement at, String name) {
    for (PsiElement p = at.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtBlockExpression && declares((KtBlockExpression) p, name)) {
        return true;
      }
      if (p instanceof KtClassOrObject) {
        Owner owner = ctx.index.byPsi.get(p);
        if (owner == null || ctx.members.hasMember(owner, name)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean declares(KtBlockExpression block, String name) {
    for (KtExpression statement : block.getStatements()) {
      if (statement instanceof KtNamedFunction && name.equals(((KtNamedFunction) statement).getName())) {
        return true;
      }
    }
    return false;
  }

  private static Fun only(List<Fun> candidates) {
    return candidates.size() == 1 ? candidates.get(0) : null;
  }
}
