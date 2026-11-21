package p;
import java.util.*;
public class S {
  public static class D1 { private final Map<String,String> f; protected D1(Map<String,String> p) { this(p, 1L); } private D1(Map<String,String> p, long k) { f = Collections.unmodifiableMap(p); } protected D1(D1 o) { this.f = o.f; } public Map<String,String> get() { return f; } }
  public static class D2 { private final Map<String,String> f; private final Object a; public D2(Map<String,String> p, Object q) { try { a = q.toString(); } catch (IllegalArgumentException e) { throw new IllegalStateException(e); } this.f = Collections.unmodifiableMap(p); } protected D2(D2 o) { this.a = o.a; this.f = o.f; } public Map<String,String> get() { return f; } }
  public static class D3 { private final Map<String,String> f; private final Object a; public D3(Map<String,String> p, Object q) { var v = this.get(); a = q.equals(v) ? q : q.toString(); this.f = Collections.unmodifiableMap(p); } protected D3(D3 o) { this.a = o.a; this.f = o.f; } public Map<String,String> get() { return f; } }
  public static class D4 { private final Map<String,String> f; public D4(Map<String,String> p) { this.f = Collections.unmodifiableMap(p); } protected D4(D4 o) { assert o.f.equals(o.get()); this.f = o.f; } public Map<String,String> get() { return f; } }
  public static class D5 { private List<String> f = Collections.emptyList(); public D5() {} protected D5(D5 o, int k) { List<String> t = o.f; f = t; } public List<String> get() { return f; } }
  public static class D6 { private List<String> f; private List<String> g; public D6(List<String> p) { g = Collections.unmodifiableList(p); } public void m() { List<String> t = g; f = t; } public List<String> get() { return f; } }
  public static class D7 { private List<String> f = Collections.emptyList(); public void m(D7 o) { List<String> t = o.f; f = t; } public List<String> get() { return f; } }
  public static class D8 { private final Map<String,String> f; private final Map<String, List<String>> h; public D8(Map<String,String> p, Map<String, List<String>> q) { this.f = Collections.unmodifiableMap(p); this.h = Collections.unmodifiableMap(q); } protected D8(D8 o) { this.f = o.f; this.h = o.h; } public Map<String,String> get() { return f; } public Map<String, List<String>> getH() { return h; } }
}
