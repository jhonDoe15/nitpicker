import java.util.*;
import static java.lang.Math.PI;
import static java.io.File.separator;
public class S40RevQ extends java.util.ArrayList<String> {
  static class Base { protected String string; private String file; }
  static class Sub extends Base {
    void a(Object o) { if (o instanceof String) { System.out.println(((String) o).length()); } }
    void a2(Object o) { if (o instanceof java.io.File) { System.out.println(((java.io.File) o).length()); } }
  }
  void b(Object o) { if (o instanceof java.io.File) { System.out.println(((java.io.File) o).length()); } }
  void c(Object o) { if (o instanceof List) { System.out.println(((List) o).size()); } }
  void c2(Object o) { if (o instanceof Long) { System.out.println(((Long) o).intValue()); } }
  void c3(Object o) { if (o instanceof Map) { System.out.println(((Map) o).size()); } }
  void d(Object o) {
    for (String string : this) { if (o instanceof String) { System.out.println(((String) o).length()); } }
  }
  void e(Object o) {
    try (java.io.StringReader string = new java.io.StringReader("")) { if (o instanceof String) { System.out.println(((String) o).length()); } } catch (Exception string) {}
  }
  void f(Object o) {
    if (o instanceof String) { System.out.println(((String) o).length()); }
    String string = "";
  }
  void g(Object o) {
    int x = 0;
    switch (x) { case 1: int string = 0; break; case 2: if (o instanceof String) { System.out.println(((String) o).length()); } }
  }
  void h(Object o) {
    if (o instanceof String && o instanceof CharSequence) { System.out.println(((String) o).length()); System.out.println(((CharSequence) o).length()); }
  }
  void i(Object o, Object p) {
    if (p instanceof String string && o instanceof String) { System.out.println(((String) o).length()); }
  }
  void j(Object o) {
    if (o instanceof java.io.File) { System.out.println(((java.io.File) o).length()); }
  }
  void k(Object o) {
    record string(int a) {}
    if (o instanceof String) { System.out.println(((String) o).length()); }
  }
  void l(Object o) {
    int PI = 0; 
    if (o instanceof Double) { System.out.println(((Double) o).intValue()); }
    if (o instanceof java.io.File) { System.out.println(((java.io.File) o).length()); }
  }
  void m(Object o) {
    if (o instanceof S40RevQ) { System.out.println(((S40RevQ) o).size()); }
  }
  void n(Object o) {
    java.util.function.Function<Object,Integer> fn = string -> { if (o instanceof String) { return ((String) o).length(); } return 0; };
  }
  Object fld = new Object() { Object string; Object z = null; { if (z instanceof String) { System.out.println(((String) z).length()); } } };
  static void s(Object o) { if (o instanceof String) { System.out.println(((String) o).length()); } }
  { Object o = null; if (o instanceof java.io.File) { System.out.println(((java.io.File) o).length()); } }
}
