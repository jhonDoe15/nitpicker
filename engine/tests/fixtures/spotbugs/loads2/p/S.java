package p;
import java.util.*;
public class S {
  public static class B1 { private List<String> f = Collections.emptyList(); private List<String> g; public B1() { g = new ArrayList<>(); } public void n() { g = Collections.emptyList(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class B2 { private List<String> f = Collections.emptyList(); private List<String> g; public void n() { g = Collections.emptyList(); } public B2() { g = new ArrayList<>(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class B3 { private List<String> f = Collections.emptyList(); private List<String> g; public void n() { g = Collections.emptyList(); } public void k() { g = new ArrayList<>(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class B4 { private List<String> f = Collections.emptyList(); private List<String> g; public void k() { g = new ArrayList<>(); } public void n() { g = Collections.emptyList(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class B5 { private List<String> f = Collections.emptyList(); private List<String> g; public void m() { f = g; } public void n() { g = Collections.emptyList(); } public List<String> get() { return f; } }
  public static class B6 { private List<String> f = Collections.emptyList(); private List<String> g; public void n() { g = Collections.emptyList(); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class B7 { private List<String> f; public B7(String[] a) { f = Set.of(a).stream().toList(); } private B7(B7 o) { f = o.f; } public List<String> get() { return f; } }
  public static class B8 { private List<String> f; private B8(B8 o) { f = o.f; } public List<String> get() { return f; } }
  public static class B9 { private List<String> f; private B9(B9 o) { f = o.f; } public B9() { f = List.of(); } public List<String> get() { return f; } }
  public static class B10 { private List<String> f; private B10(B10 o) { f = o.f; } public void m() { f = new ArrayList<>(); } public B10() { f = List.of(); } public List<String> get() { return f; } }
  public static class B11 { private List<String> f = Collections.emptyList(); private Date g = new Date(); public void m(B11 o) { f = o.f; g = o.g; } public List<String> get() { return f; } public Date getG() { return g; } }
  public static class B12 { private List<String> f = Collections.emptyList(); public void m(Hold h) { f = h.l; } public List<String> get() { return f; } }
  public static class Hold { List<String> l = List.of(); }
  public static class B13 { private List<String> f = Collections.emptyList(); public void m(Hold2 h) { f = h.l; } public List<String> get() { return f; } }
  public static class Hold2 { List<String> l = new ArrayList<>(); }
  public static class B14 { private List<String> f = Collections.emptyList(); private List<String> g = Collections.emptyList(); public void m() { List<String> t = g; f = t; } public List<String> get() { return f; } }
  public static class B15 { private List<String> f = Collections.emptyList(); private static List<String> G = Collections.emptyList(); public void m() { f = G; } public List<String> get() { return f; } }
  public static class B16 { private List<String> f = Collections.emptyList(); private static final List<String> G = new ArrayList<>(); public void m() { f = G; } public List<String> get() { return f; } }
  public static class B17 { private List<String> f = Collections.emptyList(); private List<String> g = Collections.emptyList(); public void m() { f = this.g; } public List<String> get() { return f; } public List<String> getG() { return g; } }
}
