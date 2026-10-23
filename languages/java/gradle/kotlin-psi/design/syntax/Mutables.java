package nitpicker.kotlinpsi.design.syntax;

import java.util.Set;
import org.jetbrains.kotlin.psi.*;

public final class Mutables {
  private static final Set<String> CREATORS =
      Set.of(
          "mutableListOf", "mutableMapOf", "mutableSetOf", "arrayListOf", "hashMapOf", "hashSetOf",
          "linkedMapOf", "linkedSetOf", "sortedMapOf", "sortedSetOf", "ArrayList", "HashMap", "HashSet",
          "LinkedHashMap", "LinkedHashSet", "LinkedList", "TreeMap", "TreeSet", "ArrayDeque", "PriorityQueue",
          "ConcurrentHashMap", "CopyOnWriteArrayList", "StringBuilder", "StringBuffer", "arrayOf", "intArrayOf",
          "longArrayOf", "doubleArrayOf", "booleanArrayOf", "charArrayOf", "byteArrayOf", "shortArrayOf",
          "floatArrayOf", "IntArray", "LongArray", "DoubleArray", "BooleanArray", "CharArray", "ByteArray",
          "ShortArray", "FloatArray", "Array", "arrayOfNulls");
  private static final Set<String> READ_ONLY =
      Set.of("List", "Set", "Map", "Collection", "Iterable", "Sequence", "String", "CharSequence");

  private Mutables() {}

  public static boolean created(KtExpression initializer) {
    KtExpression expression = Ps.parens(initializer);
    if (expression instanceof KtQualifiedExpression) {
      expression = ((KtQualifiedExpression) expression).getSelectorExpression();
    }
    if (!(expression instanceof KtCallExpression)) {
      return false;
    }
    String name = Ps.name((KtCallExpression) expression);
    return name != null && CREATORS.contains(name);
  }

  public static boolean readOnlyType(KtTypeReference declared) {
    if (declared == null) {
      return false;
    }
    String text = Ps.typeText(declared).replace("?", "");
    return READ_ONLY.contains(text.substring(text.lastIndexOf('.') + 1));
  }
}
