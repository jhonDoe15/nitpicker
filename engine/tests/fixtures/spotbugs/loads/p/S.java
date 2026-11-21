package p;
import java.util.*;
public class S {
  static List<String> call() { return new ArrayList<>(); }
  public static class A1 { private List<String> f = Collections.emptyList(); public List<String> get() { return f; } public void m() { f = new ArrayList<>(); } }
  public static class A2 { private List<String> f = Collections.emptyList(); public void m() { f = new ArrayList<>(); } public List<String> get() { return f; } }
  public static class A3 { private List<String> f = Collections.emptyList(); public List<String> get() { return f; } public void m() { f = call(); } }
  public static class A4 { private List<String> f = Collections.emptyList(); public void m() { f = call(); } public List<String> get() { return f; } }
  public static class A5 { private List<String> f; public List<String> get() { return f; } public A5() { f = Collections.emptyList(); } }
  public static class A6 { private List<String> f; public List<String> get() { return f; } public void m() { f = Collections.emptyList(); } }
  public static class A7 { private List<String> f = new ArrayList<>(); public List<String> get() { return f; } public void m() { f = Collections.emptyList(); } }
  public static class A8 { private List<String> f = Collections.emptyList(); private List<String> g = new ArrayList<>(); public void m() { f = g; } public List<String> get() { return f; } }
  public static class A9 { private List<String> f = Collections.emptyList(); private List<String> g = Collections.emptyList(); public void m() { f = g; } public List<String> get() { return f; } }
  public static class A10 { private List<String> f = Collections.emptyList(); public void m(A10 o) { f = o.f; } public List<String> get() { return f; } }
  public static class A11 { private List<String> f = Collections.emptyList(); private List<String> g; public void m() { f = g; } public List<String> get() { return f; } }
  public static class A12 { private List<String> f = Collections.emptyList(); public void m(List<String> p) { f = p; } public List<String> get() { return f; } }
  public static class A13 { private List<String> f = Collections.emptyList(); private List<String> g = Collections.emptyList(); public void m() { f = g; } public List<String> get() { return f; } public void n() { g = new ArrayList<>(); } }
  public static class A14 { private List<String> f = Collections.emptyList(); private List<String> g = Collections.emptyList(); public void n() { g = new ArrayList<>(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class A15 { private List<String> f = Collections.emptyList(); public void m() { List<String> l = call(); f = l; } public List<String> get() { return f; } }
  public static class A16 { private List<String> f = Collections.emptyList(); public void m(A16 o) { o.f = call(); } public List<String> get() { return f; } }
  public static class A17 { private List<String> f = Collections.emptyList(); public void m() { f = null; } public List<String> get() { return f; } }
  public static class A18 { private List<String> f = Collections.emptyList(); public void m(boolean c) { f = c ? call() : null; } public List<String> get() { return f; } }
  public static class A19 { private List<String> f = Collections.emptyList(); public void m(Map<String, List<String>> q) { f = q.get("a"); } public List<String> get() { return f; } }
  public static class A20 { private List<String> f = Collections.emptyList(); public void m(Bx q) { f = q.build(); } public List<String> get() { return f; } }
  public static class Bx { public List<String> build() { return new ArrayList<>(); } }
  public static class A21 { private List<String> f = Collections.emptyList(); public void m(Bx q) { f = (List<String>) (Object) q; } public List<String> get() { return f; } }
  public static class A22 { private List<String> f = Collections.emptyList(); public void m(Bx q) { f = new LinkedList<>(); } public List<String> get() { return f; } }
  public static class A23 { private List<String> f = Collections.emptyList(); public void m(String[] q) { f = Arrays.asList(q); } public List<String> get() { return f; } }
}
