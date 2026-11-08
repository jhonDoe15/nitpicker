package nitpicker.kotlinpsi.coroutines;

import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.Set;
import nitpicker.kotlinpsi.coroutines.Contexts.Kind;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class InlineScopes {
  private static final Set<String> INLINE_OPERATORS =
      Set.of(
          "map", "mapNotNull", "mapIndexed", "mapIndexedNotNull", "flatMap", "filter", "filterNot", "filterIndexed",
          "onEach", "associate", "associateBy", "associateWith", "groupBy", "partition", "fold", "reduce", "sumOf",
          "any", "all", "none", "count", "first", "firstOrNull", "last", "lastOrNull", "find", "single",
          "singleOrNull", "sortedBy", "sortedByDescending", "maxByOrNull", "minByOrNull", "maxOf", "minOf",
          "takeWhile", "dropWhile", "distinctBy", "mapTo", "filterTo", "flatMapTo", "forEachIndexed");
  private static final Set<String> COLLECTION_RESULTS =
      Set.of(
          "toList", "toMutableList", "toSet", "toMutableSet", "sorted", "sortedDescending", "distinct", "reversed",
          "asSequence", "asIterable", "keys", "values", "entries", "indices", "filterNotNull");
  private static final Set<String> FACTORIES =
      Set.of(
          "listOf", "mutableListOf", "arrayListOf", "setOf", "mutableSetOf", "hashSetOf", "linkedSetOf", "mapOf",
          "mutableMapOf", "hashMapOf", "linkedMapOf", "arrayOf", "intArrayOf", "sequenceOf", "emptyList", "emptySet",
          "emptyMap", "listOfNotNull", "buildList", "buildSet", "buildMap", "List", "Array");
  private static final Set<String> TYPES =
      Set.of(
          "List", "MutableList", "ArrayList", "Set", "MutableSet", "HashSet", "LinkedHashSet", "Collection",
          "MutableCollection", "Iterable", "Sequence", "Map", "MutableMap", "HashMap", "LinkedHashMap", "Array",
          "IntArray", "LongArray", "ByteArray", "CharArray", "DoubleArray", "FloatArray", "ShortArray",
          "BooleanArray", "IntRange", "LongRange", "CharRange");
  private static final Set<String> CONTAINERS =
      Set.of(
          "List", "MutableList", "ArrayList", "Set", "MutableSet", "HashSet", "LinkedHashSet", "Collection",
          "MutableCollection", "Iterable", "Sequence", "Array");
  private static final Set<String> INDEXED = Set.of("mapIndexed", "mapIndexedNotNull", "filterIndexed",
      "forEachIndexed", "fold", "reduce", "mapTo", "filterTo", "flatMapTo");
  private static final Set<String> RANGE_OPERATORS = Set.of("..", "..<", "until", "downTo", "step");
  private static final int DEPTH = 6;

  private InlineScopes() {}

  static boolean isInlineOperator(String name, KtExpression receiver) {
    return INLINE_OPERATORS.contains(name) && receiver != null && isCollection(receiver, 0);
  }

  private static boolean isCollection(KtExpression expression, int depth) {
    KtExpression target = expression == null ? null : KtPsiUtil.safeDeparenthesize(expression);
    if (target == null || depth > DEPTH) {
      return false;
    }
    if (target instanceof KtQualifiedExpression qualified) {
      KtExpression selector = qualified.getSelectorExpression();
      String name = selector instanceof KtCallExpression call ? nameOf(call.getCalleeExpression()) : nameOf(selector);
      if (name != null && (INLINE_OPERATORS.contains(name) || COLLECTION_RESULTS.contains(name))) {
        return isCollection(qualified.getReceiverExpression(), depth + 1);
      }
    }
    if (target instanceof KtCallExpression call && FACTORIES.contains(nameOf(call.getCalleeExpression()))) {
      return true;
    }
    if (target instanceof KtBinaryExpression binary) {
      return RANGE_OPERATORS.contains(binary.getOperationReference().getReferencedName());
    }
    String type = ReceiverTypes.of(target);
    return type != null && TYPES.contains(type.substring(type.lastIndexOf('.') + 1));
  }

  static boolean passesElement(String name) {
    return name != null && (name.equals("forEach") || INLINE_OPERATORS.contains(name)) && !INDEXED.contains(name);
  }

  static String elementType(String text) {
    String compact = text.replaceAll("\\s+", "").replace("?", "");
    int open = compact.indexOf('<');
    if (open < 0 || !compact.endsWith(">") || !CONTAINERS.contains(compact.substring(0, open))) {
      return null;
    }
    String inner = compact.substring(open + 1, compact.length() - 1);
    int depth = 0;
    for (char character : inner.toCharArray()) {
      depth += character == '<' ? 1 : character == '>' ? -1 : 0;
      if (character == ',' && depth == 0) {
        return null;
      }
    }
    String element = inner.replaceFirst("^(?:out|in)(?=[A-Z])", "");
    int arguments = element.indexOf('<');
    return arguments < 0 ? element : element.substring(0, arguments);
  }

  static boolean flowsOnOffloaded(KtCallExpression builder) {
    PsiElement current = builder;
    while (current.getParent() instanceof KtQualifiedExpression chain && chain.getReceiverExpression() == current) {
      if (chain.getSelectorExpression() instanceof KtCallExpression call
          && "flowOn".equals(nameOf(call.getCalleeExpression()))) {
        Kind kind = Contexts.of(CoroutineScopes.contextArgument(call));
        if (kind != Kind.NONE) {
          return kind == Kind.OFFLOADED;
        }
      }
      current = chain;
    }
    return false;
  }
}
