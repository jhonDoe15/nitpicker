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
          "add",
          "addAll",
          "addFirst",
          "addLast",
          "push",
          "pop",
          "put",
          "putAll",
          "putIfAbsent",
          "remove",
          "removeAll",
          "removeIf",
          "removeFirst",
          "removeLast",
          "retainAll",
          "clear",
          "set",
          "sort",
          "replaceAll",
          "compute",
          "computeIfAbsent",
          "computeIfPresent",
          "merge",
          "poll",
          "pollFirst",
          "pollLast",
          "offer",
          "offerFirst",
          "offerLast",
          "append",
          "insert",
          "delete",
          "deleteCharAt",
          "setCharAt",
          "setLength",
          "reverse");
  private static final Map<String, Set<String>> STATIC_MUTATORS =
      Map.of(
          "Collections", Set.of("sort", "shuffle", "reverse", "swap", "fill", "addAll"),
          "Arrays", Set.of("sort", "fill"));
  private static final Set<String> VIEWS =
      Set.of(
          "iterator",
          "listIterator",
          "descendingIterator",
          "subList",
          "entrySet",
          "keySet",
          "values",
          "headMap",
          "tailMap",
          "subMap",
          "headSet",
          "tailSet",
          "subSet",
          "descendingMap",
          "descendingSet",
          "navigableKeySet",
          "descendingKeySet");

  private final Typer typer;
  private final Ctx ctx;
  private final Set<String> reassigned = new HashSet<>();
  private final Map<Tree, Body.CallFact> facts = new IdentityHashMap<>();
  private final Map<Tree, String> pending = new IdentityHashMap<>();
  private final Map<Local, List<Body.CallFact>> aliases = new IdentityHashMap<>();

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

  public void declared(String name, Local local, Tree initializer) {
    aliases.remove(local);
    List<Body.CallFact> found = new ArrayList<>();
    collect(initializer, found);
    if (!found.isEmpty() && !reassigned.contains(name)) {
      aliases.put(local, found);
    }
  }

  private void collect(Tree initializer, List<Body.CallFact> found) {
    Tree value = initializer == null ? null : Names.unwrap(initializer);
    if (value instanceof ConditionalExpressionTree conditional) {
      collect(conditional.getTrueExpression(), found);
      collect(conditional.getFalseExpression(), found);
    } else if (value != null && facts.containsKey(value)) {
      found.add(facts.get(value));
    }
  }

  public void invoked(MethodInvocationTree tree) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)) {
      return;
    }
    String name = select.getIdentifier().toString();
    Tree receiver = Names.unparen(select.getExpression());
    if (staticMutator(receiver, name) && !tree.getArguments().isEmpty()) {
      attach(tree.getArguments().get(0), name);
    } else if (MUTATORS.contains(name)) {
      mutated(receiver, name);
    }
  }

  private boolean staticMutator(Tree receiver, String name) {
    if (!(receiver instanceof IdentifierTree identifier)) {
      return false;
    }
    String word = identifier.getName().toString();
    Set<String> names = STATIC_MUTATORS.getOrDefault(word, Set.of());
    return names.contains(name)
        && ctx.lookup(word) == null
        && typer.lookup.bareField(word, ctx.owner) == null
        && typer.project.resolveSimple(word, ctx.site()) == null;
  }

  private void mutated(Tree receiver, String how) {
    Tree source = viewSource(receiver);
    if (source != receiver) {
      attach(source, how);
      return;
    }
    Ty ty = typer.typeOf(receiver, ctx);
    if (ty.type() == null && Mutability.RECEIVERS.contains(ty.raw())) {
      attach(receiver, how);
    }
  }

  private Tree viewSource(Tree receiver) {
    Tree current = receiver;
    while (current instanceof MethodInvocationTree call && isView(call)) {
      current = Names.unparen(((MemberSelectTree) call.getMethodSelect()).getExpression());
    }
    return current;
  }

  private boolean isView(MethodInvocationTree call) {
    return call.getMethodSelect() instanceof MemberSelectTree select
        && VIEWS.contains(select.getIdentifier().toString())
        && typer.calls.resolve(call, ctx).target() == null;
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
    if (value instanceof ConditionalExpressionTree conditional) {
      attach(conditional.getTrueExpression(), how);
      attach(conditional.getFalseExpression(), how);
      return;
    }
    List<Body.CallFact> found =
        facts.containsKey(value) ? List.of(facts.get(value)) : aliased(value);
    for (Body.CallFact fact : found) {
      fact.mutation = fact.mutation == null ? how : fact.mutation;
    }
    if (found.isEmpty() && value instanceof MethodInvocationTree) {
      pending.putIfAbsent(value, how);
    }
  }

  private List<Body.CallFact> aliased(Tree value) {
    Local local =
        value instanceof IdentifierTree identifier
            ? ctx.lookup(identifier.getName().toString())
            : null;
    return local == null ? List.of() : aliases.getOrDefault(local, List.of());
  }
}
