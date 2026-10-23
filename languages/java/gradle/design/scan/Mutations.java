package nitpicker.designfacts.scan;

import com.sun.source.tree.*;
import com.sun.source.util.TreeScanner;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.facts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scope.*;

public final class Mutations {
  private static final Set<String> MUTATORS =
      Set.of(
          "add", "addAll", "addFirst", "addLast", "push", "pop", "put", "putAll", "putIfAbsent",
          "remove", "removeAll", "removeIf", "removeFirst", "removeLast", "retainAll", "clear",
          "set", "sort", "replaceAll", "compute", "computeIfAbsent", "computeIfPresent", "merge",
          "poll", "pollFirst", "pollLast", "offer", "offerFirst", "offerLast", "append", "insert",
          "delete", "deleteCharAt", "setCharAt", "setLength", "reverse");

  private final Typer typer;
  private final Ctx ctx;
  private final Set<String> reassigned = new HashSet<>();
  private final Map<Tree, Body.CallFact> facts = new IdentityHashMap<>();
  private final Map<Tree, String> pending = new IdentityHashMap<>();
  private final Map<String, Body.CallFact> aliases = new HashMap<>();

  public Mutations(Typer typer, Ctx ctx, Tree block) {
    this.typer = typer;
    this.ctx = ctx;
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitAssignment(AssignmentTree tree, Void unused) {
        markReassigned(tree.getVariable());
        return super.visitAssignment(tree, unused);
      }

      @Override
      public Void visitCompoundAssignment(CompoundAssignmentTree tree, Void unused) {
        markReassigned(tree.getVariable());
        return super.visitCompoundAssignment(tree, unused);
      }

      @Override
      public Void visitUnary(UnaryTree tree, Void unused) {
        if (isStep(tree)) {
          markReassigned(tree.getExpression());
        }
        return super.visitUnary(tree, unused);
      }
    }.scan(block, null);
  }

  public static boolean isStep(UnaryTree tree) {
    return tree.getKind().name().contains("CREMENT");
  }

  private void markReassigned(Tree variable) {
    if (Names.unparen(variable) instanceof IdentifierTree identifier) {
      reassigned.add(identifier.getName().toString());
    }
  }

  public void register(Tree call, Body.CallFact fact) {
    fact.mutation = pending.remove(call);
    facts.put(call, fact);
  }

  public void declared(String name, Tree initializer) {
    Body.CallFact fact = initializer == null ? null : facts.get(Names.unwrap(initializer));
    if (fact != null && !reassigned.contains(name)) {
      aliases.put(name, fact);
    }
  }

  public void invoked(MethodInvocationTree tree) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !MUTATORS.contains(select.getIdentifier().toString())) {
      return;
    }
    Tree receiver = Names.unparen(select.getExpression());
    Ty ty = typer.typeOf(receiver, ctx);
    if (ty.type() == null && Mutability.RECEIVERS.contains(ty.raw())) {
      attach(receiver, select.getIdentifier().toString());
    }
  }

  public void assigned(Tree variable) {
    Tree target = Names.unparen(variable);
    if (target instanceof ArrayAccessTree access) {
      Tree array = Names.unparen(access.getExpression());
      if (typer.typeOf(array, ctx).isArray()) {
        attach(array, "assign");
      }
    } else if (target instanceof MemberSelectTree select) {
      Tree base = Names.unparen(select.getExpression());
      if (typer.typeOf(base, ctx).type() != null) {
        attach(base, "assign");
      }
    }
  }

  private void attach(Tree target, String how) {
    Tree value = Names.unwrap(target);
    Body.CallFact fact = facts.get(value);
    if (fact == null && value instanceof IdentifierTree identifier) {
      fact = aliases.get(identifier.getName().toString());
    }
    if (fact != null) {
      fact.mutation = fact.mutation == null ? how : fact.mutation;
    } else if (value instanceof MethodInvocationTree) {
      pending.putIfAbsent(value, how);
    }
  }
}
