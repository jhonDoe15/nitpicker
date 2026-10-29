package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import com.sun.source.util.TreeScanner;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.scope.*;

public final class References {
  private final Typer typer;
  private final Map<FieldInfo, List<MethodInfo>> tables = new IdentityHashMap<>();

  public References(Typer typer) {
    this.typer = typer;
  }

  public MethodInfo resolve(MemberReferenceTree tree, Ctx c, int arity) {
    Tree base = Names.unparen(tree.getQualifierExpression());
    TypeInfo type = qualifier(base, c);
    if (type == null) {
      return null;
    }
    if (tree.getMode() == MemberReferenceTree.ReferenceMode.NEW) {
      return type.isInterface() ? null : typer.lookup.onlyConstructor(type, arity);
    }
    boolean unbound = typer.typeNameOf(base, c) != null;
    return typer.lookup.onlyMethod(
        type, tree.getName().toString(), new Lookup.Shape(arity, unbound));
  }

  private TypeInfo qualifier(Tree base, Ctx c) {
    if (base instanceof IdentifierTree identifier) {
      if (identifier.getName().contentEquals("this")) {
        return c.owner;
      }
      if (identifier.getName().contentEquals("super")) {
        return null;
      }
    }
    TypeInfo named = typer.typeNameOf(base, c);
    return named != null ? named : typer.typeOf(base, c).type();
  }

  public List<MethodInfo> table(FieldInfo field) {
    if (field == null
        || !field.isStatic
        || !field.isFinal()
        || field.tree.getInitializer() == null) {
      return List.of();
    }
    return tables.computeIfAbsent(field, this::scan);
  }

  private List<MethodInfo> scan(FieldInfo field) {
    Ctx ctx = Ctx.forType(field.owner);
    List<MethodInfo> found = new ArrayList<>();
    new TreeScanner<Void, Void>() {
      private int lambdas;

      @Override
      public Void visitMemberReference(MemberReferenceTree tree, Void unused) {
        add(resolve(tree, ctx, Arity.UNKNOWN));
        return super.visitMemberReference(tree, unused);
      }

      @Override
      public Void visitLambdaExpression(LambdaExpressionTree tree, Void unused) {
        lambdas++;
        super.visitLambdaExpression(tree, unused);
        lambdas--;
        return null;
      }

      @Override
      public Void visitMethodInvocation(MethodInvocationTree tree, Void unused) {
        if (lambdas > 0) {
          add(typer.calls.resolve(tree, ctx).target());
        }
        return super.visitMethodInvocation(tree, unused);
      }

      private void add(MethodInfo method) {
        if (method != null && !found.contains(method)) {
          found.add(method);
        }
      }
    }.scan(field.tree.getInitializer(), null);
    return List.copyOf(found);
  }
}
