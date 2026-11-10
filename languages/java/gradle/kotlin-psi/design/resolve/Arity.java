package nitpicker.kotlinpsi.design.resolve;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.psi.*;

public final class Arity {
  private static final Set<String> PRIMITIVES =
      Set.of("String", "Int", "Long", "Short", "Byte", "Boolean", "Double", "Float", "Char");

  private Arity() {}

  public static final class Arg {
    public final String name;
    public final boolean lambda;
    public final KtExpression expression;

    public Arg(String name, boolean lambda, KtExpression expression) {
      this.name = name;
      this.lambda = lambda;
      this.expression = expression;
    }
  }

  public static List<Arg> args(KtCallExpression call) {
    List<Arg> args = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      String name = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      args.add(new Arg(name, argument instanceof KtLambdaArgument, argument.getArgumentExpression()));
    }
    return args;
  }

  public static int[] bind(List<KtParameter> params, List<Arg> args) {
    Slots slots = new Slots(params);
    int[] mapping = new int[args.size()];
    for (int i = 0; i < args.size(); i++) {
      int index = slots.take(args.get(i));
      if (index < 0) {
        return null;
      }
      mapping[i] = index;
    }
    return slots.complete() ? mapping : null;
  }

  private static final class Slots {
    private final List<KtParameter> params;
    private final boolean[] bound;
    private int position;

    public Slots(List<KtParameter> params) {
      this.params = params;
      this.bound = new boolean[params.size()];
    }

    public int take(Arg arg) {
      int index = arg.name != null ? named(params, arg.name) : arg.lambda ? params.size() - 1 : positional();
      boolean repeated = index >= 0 && bound[index] && !params.get(index).isVarArg();
      if (index < 0 || repeated) {
        return -1;
      }
      bound[index] = true;
      return index;
    }

    public boolean complete() {
      for (int i = 0; i < params.size(); i++) {
        if (!bound[i] && !params.get(i).hasDefaultValue() && !params.get(i).isVarArg()) {
          return false;
        }
      }
      return true;
    }

    private int positional() {
      int size = params.size();
      while (position < size && bound[position] && !params.get(position).isVarArg()) {
        position++;
      }
      int index = position < size ? position : -1;
      position = index >= 0 && !params.get(index).isVarArg() ? index + 1 : position;
      return index;
    }
  }

  private static int named(List<KtParameter> params, String name) {
    for (int i = 0; i < params.size(); i++) {
      if (name.equals(params.get(i).getName())) {
        return i;
      }
    }
    return -1;
  }

  public static boolean primitive(String type) {
    return PRIMITIVES.contains(type);
  }

  public static boolean literalFits(String literal, String parameter) {
    String type = parameter.endsWith("?") ? parameter.substring(0, parameter.length() - 1) : parameter;
    if (!PRIMITIVES.contains(type)) {
      return true;
    }
    return switch (literal) {
      case "Int" -> Set.of("Int", "Long", "Short", "Byte").contains(type);
      case "Double" -> Set.of("Double", "Float").contains(type);
      default -> literal.equals(type);
    };
  }
}
