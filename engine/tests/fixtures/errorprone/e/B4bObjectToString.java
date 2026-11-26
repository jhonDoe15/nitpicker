package e;

import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;

public class B4bObjectToString {
  static final class Plain {}
  static final class Own { @Override public String toString() { return "own"; } }
  static class Open {}
  static final class Child extends Open {}
  static class Base { @Override public String toString() { return "base"; } }
  static final class Derived extends Base {}
  interface Named { String toString(); }
  static final class Impl implements Named { public String toString() { return "i"; } }
  interface Marker {}
  static final class Marked implements Marker {}
  record Rec(int a) {}
  enum Color { RED }
  static final class Gen<T> {}
  static final class Pair<A, B> {}
  static final class Outer { static final class Inner {} }

  static void notFormat(String s, Object... args) {}

  @com.google.errorprone.annotations.FormatMethod
  static void fmt(String s, Object... args) {}

  void concat(Plain p, Own o, Open open, Child c, Derived d, Impl i, Marked m, Rec r, Color color, String s) {
    String a = "x" + p;
    String b = p + "x";
    String c1 = "x" + o + open;
    String c2 = "x" + c;
    String c3 = "x" + d + i + m + r + color;
    String c4 = s + p + m;
    String c5 = p + s;
    int n = 1 + 2;
    s += p;
    s += o;
    String t = "";
    t += c;
    t += (p);
    Object obj = p;
    String c6 = "" + obj;
    String c7 = "" + null;
  }

  void calls(Plain p, Own o, Child c, Gen<String> g, Pair<String, List<Integer>> pair, Outer.Inner inner, StringBuilder sb) {
    System.out.println(p);
    System.out.println(o);
    System.out.print(c);
    System.out.println(String.valueOf(p));
    System.out.println(p.toString());
    System.out.println(o.toString());
    String f = String.format("%s %s", p, o);
    String f2 = String.format("%s", c);
    String f3 = "%s".formatted(p);
    sb.append(p);
    sb.append(o);
    sb.append("x").append(g);
    String x = pair.toString() + g + inner;
    fmt("%s", p);
    fmt("%s", o);
    notFormat("%s", p);
    String.format("%s", new Object[] {p});
    String.format("%s %s", "a", new Object[] {p});
    String.format("%s", (Object) p);
    String.format(java.util.Locale.ROOT, "%s", p);
    Supplier<String> sup = () -> "a" + p;
  }

  void refs(List<Plain> plains, List<Own> owns) {
    Function<Plain, String> f1 = Plain::toString;
    Function<Plain, String> f2 = String::valueOf;
    Function<Own, String> f3 = Own::toString;
    Function<Object, String> f4 = Object::toString;
    plains.stream().map(Plain::toString);
    plains.stream().map(String::valueOf);
    plains.stream().map(Object::toString);
    owns.stream().map(Own::toString);
    plains.forEach(System.out::println);
    Plain held = new Plain();
    Supplier<String> f5 = held::toString;
  }

  @SuppressWarnings("ObjectToString")
  void suppressed(Plain p) {
    String a = "x" + p;
  }

  void selfCall() {
    String a = "x" + this;
    String b = toString();
    String c = super.toString();
  }

  static final class Self {
    void use() {
      String a = "x" + this;
      String b = this.toString();
      String c = "x" + new Self();
    }
  }
}
