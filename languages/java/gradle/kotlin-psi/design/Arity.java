package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.psi.*;

final class Arity {
  private static final Set<String> PRIMITIVES =
      Set.of("String", "Int", "Long", "Short", "Byte", "Boolean", "Double", "Float", "Char");

  private Arity() {}

  static final class Arg {
    final String name;
    final boolean lambda;
    final KtExpression expression;

    Arg(String name, boolean lambda, KtExpression expression) {
      this.name = name;
      this.lambda = lambda;
      this.expression = expression;
    }
  }

  static List<Arg> args(KtCallExpression call) {
    List<Arg> args = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      String name = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      args.add(new Arg(name, argument instanceof KtLambdaArgument, argument.getArgumentExpression()));
    }
    return args;
  }

  static int[] bind(List<KtParameter> params, List<Arg> args) {
    int size = params.size();
    boolean[] bound = new boolean[size];
    int[] mapping = new int[args.size()];
    int position = 0;
    for (int i = 0; i < args.size(); i++) {
      Arg arg = args.get(i);
      int index;
      if (arg.name != null) {
        index = named(params, arg.name);
      } else if (arg.lambda) {
        index = size - 1;
      } else {
        while (position < size && bound[position] && !params.get(position).isVarArg()) {
          position++;
        }
        index = position < size ? position : -1;
        position = index >= 0 && !params.get(index).isVarArg() ? index + 1 : position;
      }
      boolean repeated = index >= 0 && bound[index] && !params.get(index).isVarArg();
      if (index < 0 || repeated) {
        return null;
      }
      bound[index] = true;
      mapping[i] = index;
    }
    for (int i = 0; i < size; i++) {
      if (!bound[i] && !params.get(i).hasDefaultValue() && !params.get(i).isVarArg()) {
        return null;
      }
    }
    return mapping;
  }

  private static int named(List<KtParameter> params, String name) {
    for (int i = 0; i < params.size(); i++) {
      if (name.equals(params.get(i).getName())) {
        return i;
      }
    }
    return -1;
  }

  static boolean primitive(String type) {
    return PRIMITIVES.contains(type);
  }

  static boolean literalFits(String literal, String parameter) {
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
