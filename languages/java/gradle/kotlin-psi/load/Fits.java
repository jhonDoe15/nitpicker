package nitpicker.kotlinpsi.load;

import static nitpicker.kotlinpsi.common.Psi.nameOf;
import static nitpicker.kotlinpsi.common.Psi.withoutTypeArguments;

import java.util.*;
import org.jetbrains.kotlin.KtNodeTypes;
import org.jetbrains.kotlin.psi.*;

final class Fits {
  private static final Map<String, Set<String>> ACCEPTED_BY =
      Map.of(
          "Int", Set.of("Int", "Long", "Short", "Byte", "Number", "Comparable"),
          "Long", Set.of("Long", "Number", "Comparable"),
          "Double", Set.of("Double", "Float", "Number", "Comparable"),
          "Boolean", Set.of("Boolean", "Comparable"),
          "String", Set.of("String", "CharSequence", "Comparable"),
          "Map", Set.of("Map"),
          "MutableMap", Set.of("MutableMap", "Map"),
          "List", Set.of("List", "Collection", "Iterable"),
          "MutableList", Set.of("MutableList", "List", "MutableCollection", "Collection", "Iterable"),
          "Set", Set.of("Set", "Collection", "Iterable"));
  private static final Map<String, String> FACTORIES =
      Map.ofEntries(
          Map.entry("emptyMap", "Map"), Map.entry("mapOf", "Map"), Map.entry("mutableMapOf", "MutableMap"),
          Map.entry("hashMapOf", "MutableMap"), Map.entry("emptyList", "List"), Map.entry("listOf", "List"),
          Map.entry("mutableListOf", "MutableList"), Map.entry("arrayListOf", "MutableList"),
          Map.entry("emptySet", "Set"), Map.entry("setOf", "Set"));

  private Fits() {}

  static boolean fits(List<? extends ValueArgument> arguments, List<KtParameter> parameters) {
    Set<String> names = new HashSet<>();
    for (KtParameter parameter : parameters) {
      names.add(parameter.getName());
    }
    int required = 0;
    boolean varargs = false;
    for (KtParameter parameter : parameters) {
      varargs |= parameter.isVarArg();
      required += parameter.hasDefaultValue() || parameter.isVarArg() ? 0 : 1;
    }
    for (ValueArgument argument : arguments) {
      if (argument.isNamed() && !names.contains(argument.getArgumentName().getAsName().asString())) {
        return false;
      }
    }
    boolean counted = arguments.size() >= required && (varargs || arguments.size() <= parameters.size());
    return counted && typesFit(arguments, parameters);
  }

  private static boolean typesFit(List<? extends ValueArgument> arguments, List<KtParameter> parameters) {
    for (int index = 0; index < arguments.size() && index < parameters.size(); index++) {
      ValueArgument argument = arguments.get(index);
      if (argument.isNamed() || parameters.get(index).isVarArg()) {
        return true;
      }
      if (!accepts(parameters.get(index), literalType(argument.getArgumentExpression()))) {
        return false;
      }
    }
    return true;
  }

  private static boolean accepts(KtParameter parameter, String literal) {
    KtTypeReference type = parameter.getTypeReference();
    if (literal == null || type == null) {
      return true;
    }
    String written = withoutTypeArguments(type.getText()).replace("?", "").trim();
    String simple = written.substring(written.lastIndexOf('.') + 1);
    return simple.equals("Any") || ACCEPTED_BY.getOrDefault(literal, Set.of(literal)).contains(simple);
  }

  private static String literalType(KtExpression expression) {
    KtExpression value = KtPsiUtil.safeDeparenthesize(expression);
    if (value instanceof KtStringTemplateExpression) {
      return "String";
    }
    if (value instanceof KtConstantExpression) {
      return constantType((KtConstantExpression) value);
    }
    return value instanceof KtCallExpression
        ? FACTORIES.get(nameOf(((KtCallExpression) value).getCalleeExpression()))
        : null;
  }

  private static String constantType(KtConstantExpression constant) {
    if (constant.getNode().getElementType() == KtNodeTypes.INTEGER_CONSTANT) {
      return constant.getText().endsWith("L") ? "Long" : "Int";
    }
    if (constant.getNode().getElementType() == KtNodeTypes.FLOAT_CONSTANT) {
      return "Double";
    }
    return constant.getNode().getElementType() == KtNodeTypes.BOOLEAN_CONSTANT ? "Boolean" : null;
  }
}
