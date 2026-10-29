package nitpicker.kotlinpsi.design.syntax;

import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.model.Source;
import org.jetbrains.kotlin.psi.*;

public final class Mutables {
  private static final int HOPS = 4;
  private static final Set<String> CREATORS =
      Set.of(
          "mutableListOf", "mutableMapOf", "mutableSetOf", "arrayListOf", "hashMapOf", "hashSetOf",
          "linkedMapOf", "linkedSetOf", "sortedMapOf", "sortedSetOf", "ArrayList", "HashMap", "HashSet",
          "LinkedHashMap", "LinkedHashSet", "LinkedList", "TreeMap", "TreeSet", "ArrayDeque", "PriorityQueue",
          "ConcurrentHashMap", "CopyOnWriteArrayList", "StringBuilder", "StringBuffer", "arrayOf", "intArrayOf",
          "longArrayOf", "doubleArrayOf", "booleanArrayOf", "charArrayOf", "byteArrayOf", "shortArrayOf",
          "floatArrayOf", "IntArray", "LongArray", "DoubleArray", "BooleanArray", "CharArray", "ByteArray",
          "ShortArray", "FloatArray", "Array", "arrayOfNulls", "toMutableList", "toMutableSet", "toMutableMap");
  private static final Set<String> KEEPS_RECEIVER = Set.of("apply", "also");
  private static final Set<String> RETURNS_LAMBDA = Set.of("run", "let");
  private static final Set<String> READ_ONLY =
      Set.of("List", "Set", "Map", "Collection", "Iterable", "Sequence", "String", "CharSequence");

  private Mutables() {}

  public static boolean created(Source source, KtExpression initializer) {
    KtExpression expression = Ps.parens(initializer);
    for (int hop = 0; hop < HOPS && expression != null; hop++) {
      KtCallExpression call = callOf(expression);
      String name = call == null ? null : canonical(source, Ps.name(call));
      if (name == null) {
        return false;
      }
      if (CREATORS.contains(name)) {
        return true;
      }
      expression = next(call, expression, name);
    }
    return false;
  }

  public static boolean lazyCreated(Source source, KtExpression delegate) {
    KtExpression expression = Ps.parens(delegate);
    if (!(expression instanceof KtCallExpression) || !"lazy".equals(Ps.name((KtCallExpression) expression))) {
      return false;
    }
    return created(source, lastStatement((KtCallExpression) expression));
  }

  public static boolean readOnlyType(KtTypeReference declared) {
    if (declared == null) {
      return false;
    }
    String text = Ps.typeText(declared).replace("?", "");
    return READ_ONLY.contains(text.substring(text.lastIndexOf('.') + 1));
  }

  private static KtCallExpression callOf(KtExpression expression) {
    KtExpression selector = expression;
    if (expression instanceof KtQualifiedExpression) {
      selector = ((KtQualifiedExpression) expression).getSelectorExpression();
    }
    return selector instanceof KtCallExpression ? (KtCallExpression) selector : null;
  }

  private static String canonical(Source source, String name) {
    String imported = name == null ? null : source.imports.get(name);
    return imported == null ? name : imported.substring(imported.lastIndexOf('.') + 1);
  }

  private static KtExpression next(KtCallExpression call, KtExpression expression, String name) {
    if (KEEPS_RECEIVER.contains(name) && expression instanceof KtQualifiedExpression) {
      return Ps.parens(((KtQualifiedExpression) expression).getReceiverExpression());
    }
    return RETURNS_LAMBDA.contains(name) ? Ps.parens(lastStatement(call)) : null;
  }

  private static KtExpression lastStatement(KtCallExpression call) {
    List<KtLambdaArgument> lambdas = call.getLambdaArguments();
    KtLambdaExpression lambda = lambdas.isEmpty() ? null : lambdas.get(0).getLambdaExpression();
    KtBlockExpression body = lambda == null ? null : lambda.getBodyExpression();
    List<KtExpression> statements = body == null ? List.of() : body.getStatements();
    return statements.isEmpty() ? null : statements.get(statements.size() - 1);
  }
}
