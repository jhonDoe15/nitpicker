package e;

import java.util.Arrays;
import java.util.Objects;

class B7Arrays {
  void toStrings(int[] ints, Object[] objects, int[][] nested, String[] strings, char[] chars, Exception exception) {
    String a = "" + ints;
    String b = ints.toString();
    String c = String.valueOf(objects);
    String d = nested.toString();
    String e = "x" + nested;
    String f = String.valueOf(chars);
    String g = chars.toString();
    String h = exception.getStackTrace().toString();
    String i = "" + exception.getStackTrace();
    System.out.println(ints);
    System.out.println(chars);
    System.out.print(strings);
    StringBuilder builder = new StringBuilder();
    builder.append(ints);
    builder.append(chars);
    String j = String.format("%s", ints);
    String k = String.format("%s %s", objects, strings);
    String l = String.format("%s", (Object[]) objects);
    String m = String.format("%s", (Object) objects);
    String n = "%s".formatted(ints);
    String o = a + b;
    a += ints;
    a += strings;
    String p = (ints).toString();
    int q = ints.length + 1;
    Object object = null;
    String r = "" + null;
    java.util.function.Function<int[], String> fn = Object::toString;
    java.util.function.Function<int[], String> fn2 = String::valueOf;
  }

  @SuppressWarnings("ArrayToString")
  String suppressed(int[] ints) {
    return ints.toString();
  }

  int hashes(int[] ints, Object[] objects, String[] strings, int[][] nested) {
    int a = ints.hashCode();
    int b = Objects.hashCode(ints);
    int c = Objects.hash(ints);
    int d = Objects.hash(objects);
    int e = Objects.hash(strings);
    int f = Objects.hash(nested);
    int g = Objects.hash(ints, 1, objects);
    int h = Objects.hash(1, 2);
    int i = nested.hashCode();
    int j = Arrays.hashCode(ints);
    int k = Objects.hashCode(objects);
    int l = Objects.hash(ints, nested);
    return a + b + c + d + e + f + g + h + i + j + k + l;
  }
}
