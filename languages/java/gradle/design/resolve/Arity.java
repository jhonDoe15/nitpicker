package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import com.sun.source.util.TreePath;
import java.util.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.scope.*;

public final class Arity {
  public static final int UNKNOWN = -1;

  private static final Map<String, Integer> LIBRARY = new HashMap<>();

  static {
    register(0, "Runnable Callable Supplier BooleanSupplier IntSupplier LongSupplier");
    register(0, "DoubleSupplier");
    register(1, "Consumer Function Predicate UnaryOperator IntFunction IntPredicate");
    register(1, "IntConsumer IntUnaryOperator LongFunction LongPredicate LongConsumer");
    register(1, "LongUnaryOperator DoubleFunction DoublePredicate DoubleConsumer");
    register(1, "DoubleUnaryOperator ToIntFunction ToLongFunction ToDoubleFunction");
    register(1, "IntToLongFunction IntToDoubleFunction LongToIntFunction LongToDoubleFunction");
    register(1, "DoubleToIntFunction DoubleToLongFunction");
    register(2, "BiConsumer BiFunction BiPredicate BinaryOperator Comparator IntBinaryOperator");
    register(2, "LongBinaryOperator DoubleBinaryOperator ToIntBiFunction ToLongBiFunction");
    register(2, "ToDoubleBiFunction ObjIntConsumer ObjLongConsumer ObjDoubleConsumer");
  }

  private static void register(int arity, String names) {
    for (String name : names.split(" ")) {
      LIBRARY.put(name, arity);
    }
  }

  private final Typer typer;
  private final Ctx ctx;

  public Arity(Typer typer, Ctx ctx) {
    this.typer = typer;
    this.ctx = ctx;
  }

  public int of(TreePath path) {
    TreePath at = path;
    while (at.getParentPath().getLeaf() instanceof ParenthesizedTree) {
      at = at.getParentPath();
    }
    Tree leaf = at.getLeaf();
    TreePath parentPath = at.getParentPath();
    return switch (parentPath.getLeaf()) {
      case VariableTree variable when variable.getInitializer() == leaf ->
          ofTy(typer.tyOf(variable.getType(), ctx));
      case TypeCastTree cast -> ofTy(typer.tyOf(cast.getType(), ctx));
      case AssignmentTree assignment when assignment.getExpression() == leaf ->
          ofTy(typer.typeOf(assignment.getVariable(), ctx));
      case ReturnTree returned -> returned(parentPath);
      default -> argument(parentPath.getLeaf(), leaf);
    };
  }

  private int returned(TreePath path) {
    for (TreePath current = path; current != null; current = current.getParentPath()) {
      Tree leaf = current.getLeaf();
      if (leaf instanceof LambdaExpressionTree || leaf instanceof ClassTree) {
        return UNKNOWN;
      }
      if (leaf instanceof MethodTree method) {
        boolean own = ctx.method != null && method == ctx.method.tree;
        return own ? ofTy(typer.tyOf(method.getReturnType(), ctx)) : UNKNOWN;
      }
    }
    return UNKNOWN;
  }

  private int argument(Tree call, Tree leaf) {
    List<? extends ExpressionTree> arguments =
        switch (call) {
          case MethodInvocationTree invocation -> invocation.getArguments();
          case NewClassTree creation -> creation.getArguments();
          default -> List.of();
        };
    int index = arguments.indexOf(leaf);
    MethodInfo target = index < 0 ? null : typer.calls.resolve(call, ctx).target();
    if (target == null || index >= target.params.size() || target.params.get(index).varargs) {
      return UNKNOWN;
    }
    Tree type = target.params.get(index).type;
    return ofTy(typer.tyOf(type, new Ctx(target.owner, target.typeVars)));
  }

  private int ofTy(Ty ty) {
    if (ty.type() == null) {
      return ty.text() == null ? UNKNOWN : LIBRARY.getOrDefault(ty.raw(), UNKNOWN);
    }
    TypeInfo type = ty.type();
    if (!type.isInterface() || typer.lookup.incomplete(type)) {
      return UNKNOWN;
    }
    Map<String, MethodInfo> abstracts = new LinkedHashMap<>();
    for (TypeInfo member : typer.lookup.chain(type)) {
      addAbstracts(member, abstracts);
    }
    return abstracts.size() == 1 ? abstracts.values().iterator().next().params.size() : UNKNOWN;
  }

  private static void addAbstracts(TypeInfo member, Map<String, MethodInfo> abstracts) {
    for (MethodInfo method : member.methods) {
      if (method.tree != null && !method.isStatic && method.tree.getBody() == null) {
        abstracts.putIfAbsent(method.name + "(" + Lookup.signature(method), method);
      }
    }
  }
}
