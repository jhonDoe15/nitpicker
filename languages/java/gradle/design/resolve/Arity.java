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
    for (String name : List.of(
        "Runnable", "Callable", "Supplier", "BooleanSupplier", "IntSupplier", "LongSupplier",
        "DoubleSupplier")) {
      LIBRARY.put(name, 0);
    }
    for (String name : List.of(
        "Consumer", "Function", "Predicate", "UnaryOperator", "IntFunction", "IntPredicate", "IntConsumer",
        "IntUnaryOperator", "LongFunction", "LongPredicate", "LongConsumer", "LongUnaryOperator",
        "DoubleFunction", "DoublePredicate", "DoubleConsumer", "DoubleUnaryOperator", "ToIntFunction",
        "ToLongFunction", "ToDoubleFunction", "IntToLongFunction", "IntToDoubleFunction", "LongToIntFunction",
        "LongToDoubleFunction", "DoubleToIntFunction", "DoubleToLongFunction")) {
      LIBRARY.put(name, 1);
    }
    for (String name : List.of(
        "BiConsumer", "BiFunction", "BiPredicate", "BinaryOperator", "Comparator", "IntBinaryOperator",
        "LongBinaryOperator", "DoubleBinaryOperator", "ToIntBiFunction", "ToLongBiFunction",
        "ToDoubleBiFunction", "ObjIntConsumer", "ObjLongConsumer", "ObjDoubleConsumer")) {
      LIBRARY.put(name, 2);
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
      case MethodInvocationTree call -> argument(call, call.getArguments().indexOf(leaf));
      case NewClassTree creation -> argument(creation, creation.getArguments().indexOf(leaf));
      default -> UNKNOWN;
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

  private int argument(Tree call, int index) {
    MethodInfo target = index < 0 ? null : typer.calls.resolve(call, ctx).target();
    if (target == null || index >= target.params.size()) {
      return UNKNOWN;
    }
    ParamInfo param = target.params.get(index);
    if (param.varargs) {
      return UNKNOWN;
    }
    return ofTy(typer.tyOf(param.type, new Ctx(target.owner, target.typeVars)));
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
      member.methods.stream()
          .filter(method -> method.tree != null && !method.isStatic && method.tree.getBody() == null)
          .forEach(method -> abstracts.putIfAbsent(method.name + "(" + Lookup.signature(method), method));
    }
    return abstracts.size() == 1 ? abstracts.values().iterator().next().params.size() : UNKNOWN;
  }
}
