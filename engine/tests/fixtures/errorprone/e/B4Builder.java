package e;

import java.util.function.Function;

public class B4Builder {
  String a(String s, int i, char c, Object o) {
    return new StringBuilder().append("x").append(s).append(i).append(c).toString();
  }

  String b(String s) {
    return new StringBuilder(s).append("y").toString();
  }

  String c() {
    return new StringBuilder().toString();
  }

  String d(int i) {
    return new StringBuilder(16).append(i).toString();
  }

  String e(String s, int i) {
    return new StringBuilder("a").append(i + 1).append(s + "b").append(-i).append(i > 0 ? "p" : "q").toString();
  }

  int f(String s) {
    return new StringBuilder("a").append(s).toString().length();
  }

  String g(String s) {
    return new StringBuilder("a").append(s, 0, 1).toString();
  }

  String h(String s) {
    return new StringBuilder("a").append(s).reverse().toString();
  }

  void i(String s) {
    String t = new StringBuilder("a").append(s).append("b" + "c").toString();
    Object o = new StringBuilder("a").append(s);
    StringBuilder sb = new StringBuilder("a").append(s);
    sb.append("z");
  }

  void j(String s) {
    StringBuilder sb = new StringBuilder("a").append(s);
    System.out.println(sb.toString());
  }

  void k(String s) {
    var sb = new StringBuilder("a").append(s);
    System.out.println(sb);
  }

  void l(String s) {
    new StringBuilder("a").append(s);
  }

  void m(Object s) {
    System.out.println(new StringBuilder("a").append(s));
    String.valueOf(new StringBuilder("a").append(s));
    foo(new StringBuilder("a").append(s));
  }

  void foo(Object o) {}

  Object n(String s) {
    return new StringBuilder("a").append(s);
  }

  StringBuilder o(String s) {
    return new StringBuilder("a").append(s);
  }

  String p(String s) {
    return new StringBuilder("a").append(s).toString().trim();
  }

  String q(String s) {
    return (new StringBuilder("a").append(s)).toString();
  }

  @SuppressWarnings("UnnecessaryStringBuilder")
  String s(String s) {
    return new StringBuilder("a").append(s).toString();
  }

  String t(String s) {
    StringBuilder sb = new StringBuilder("a");
    sb.append(s);
    return sb.toString();
  }
}
