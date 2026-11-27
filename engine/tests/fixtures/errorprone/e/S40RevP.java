import java.util.*;
public class S40RevP {
  static String string = "x";
  int list;
  class In<T> { }
  record R(int a) { }
  void a(Object o) {
    if (o instanceof String) { String s = (String) o; System.out.println(s); }
  }
  void b(Object o, String string) {
    if (o instanceof String) { System.out.println(((String) o).length()); }
  }
  void c(Object o) {
    if (o instanceof String) { System.out.println(((String) o).length()); }
    Runnable r = () -> { int string = 1; };
  }
  void d(Object o) {
    Runnable r = () -> { int string = 1; if (o instanceof String) { System.out.println(((String) o).length()); } };
  }
  void e(Object o) {
    if (o instanceof List) { System.out.println(((List) o).size()); }
    if (o instanceof Map.Entry) { System.out.println(((Map.Entry) o).getKey()); }
    if (o instanceof int[]) { System.out.println(((int[]) o).length); }
    if (o instanceof Integer) { System.out.println(((Integer) o) + 1); }
    if (o instanceof R) { System.out.println(((R) o).a()); }
    if (o instanceof S40RevP.R) { System.out.println(((R) o).a()); }
  }
  void f(Object o) {
    class Local { int list; }
    if (o instanceof List) { System.out.println(((List) o).size()); }
    new Object() { int string; void m() { if (o instanceof String) { System.out.println(((String) o).length()); } } };
  }
  void g(Object o) {
    if (!(o instanceof String)) return;
    System.out.println(((String) o).length());
  }
  void i(Object o) {
    String s = o instanceof String ? ((String) o).trim() : "";
    boolean b = o instanceof String && ((String) o).isEmpty();
    boolean c = !(o instanceof String) || ((String) o).isEmpty();
    for (;;) { if (o instanceof String) { foo((String) o); } }
  }
  void foo(String s) {}
  void j(Object o) {
    if (o instanceof String) { 
      final String s1 = (String) o, s2 = "a";
    }
    if (o instanceof String) { 
      String s1 = "a", s2 = (String) o;
    }
    if (o instanceof String) { 
      var s1 = (String) o;
    }
    if (o instanceof String) { 
      Object s1 = (String) o;
    }
    if (o instanceof CharSequence) { 
      CharSequence cs = (CharSequence) o; String q = cs.toString();
    }
  }
  void k(Object o) {
    if (o instanceof Object) { System.out.println(((Object) o).hashCode()); }
    if (o instanceof StringBuilder) { System.out.println(((StringBuilder) o).length()); }
    if (o instanceof java.io.IOException) { System.out.println(((java.io.IOException) o).getMessage()); }
    if (o instanceof Thread.State) { System.out.println(((Thread.State) o).name()); }
    if (o instanceof Character) { System.out.println(((Character) o) + 1); }
    if (o instanceof Long) { System.out.println(((Long) o) + 1); }
  }
}
