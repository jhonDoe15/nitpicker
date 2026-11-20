package p;
import java.util.*;
public class G {
  public record R1(String a, Mut... ms) { }
  public record R2(String a, Mut... ms) { public R2 { Objects.requireNonNull(a); } }
  public record R3(int... xs) { }
  public static class T1 { private final Map<String, Object> f; public T1(Map<String, Object> p) { this.f = p == null ? null : Map.copyOf(p); } public Map<String, Object> get() { return f; } }
  public static class T2 { private final Map<String, Object> f; public T2(Map<String, Object> p, boolean c) { this.f = c ? null : Map.copyOf(p); } public Map<String, Object> get() { return f; } }
  public static class T3 { private final Map<String, Object> f; public T3(Map<String, Object> p) { this.f = p != null ? Map.copyOf(p) : null; } public Map<String, Object> get() { return f; } }
  public static class T4 { private final List<String> f; public T4(List<String> p) { this.f = p == null ? List.of() : List.copyOf(p); } public List<String> get() { return f; } }
  public static class T5 { private final Map<String, Object> f; public T5(Map<String, Object> p) { this.f = p == null ? null : Collections.unmodifiableMap(p); } public Map<String, Object> get() { return f; } }
  public static class T6 { private final Map<String, Object> f; public T6(Map<String, Object> p) { this.f = p == null ? Map.of() : Map.copyOf(p); } public Map<String, Object> get() { return f; } }
  public static class T7 { private final Map<String, Object> f; public T7(Map<String, Object> p, Object q) { this.f = q == null ? null : Map.copyOf(p); } public Map<String, Object> get() { return f; } }
  public static class T8 { private final Map<String, Object> f; public T8(Map<String, Object> p) { this.f = Map.copyOf(p); } public Map<String, Object> get() { return f; } }
  public interface PC { void setQ(int q); }
  public static class Impl implements PC { Impl(Object o, int k) { } public void setQ(int q) { } }
  public static class U1 { private final PC f; private int z; public U1(int k) { if (k == 0) { this.f = new Impl(this, 1); } else { this.f = null; } z = k; }
    public PC get(int id) { if (z == 2 && id == 3) { return f; } return new Impl(this, id); } }
  public static class U2 { private final PC f; public U2(int k) { if (k == 0) { this.f = new Impl(this, 1); } else { this.f = null; } } public PC get() { return f; } }
  public static class U3 { private final PC f; public U3(int k) { this.f = new Impl(this, 1); } public PC get() { return f; } }
  public static class U4 { private final PC f; public U4(int k) { this.f = new Impl(null, 1); } public PC get() { return f; } }
  public interface PI { int q(); }
  public static class ImplI implements PI { int v; ImplI(Object o, int k) { } public int q() { return 1; } public void setQ(int q) { } }
  public static class U5 { private final PI f; public U5(int k) { if (k == 0) { this.f = new ImplI(this, 1); } else { this.f = null; } } public PI get() { return f; } }
  public static class U6 { private final PI f; public U6(int k) { this.f = new ImplI(this, 1); } public PI get() { return f; } }
  public static class U7 { private final PI f; public U7(int k) { this.f = new ImplI(null, 1); } public PI get() { return f; } }
  public static class U8 { private final PI f; public U8(int k) { if (k == 0) { this.f = new ImplI(null, 1); } else { this.f = null; } } public PI get() { return f; } }
  public static class V1 { private final Set<String> f; public V1(String[] a) { this.f = Set.of(a); } private V1(V1 o) { this.f = o.f; } public Set<String> get() { return f; } }
  public static class V2 { private Set<String> f; private Map<String, String> s;
    public Set<String> get() { final Set<String> k = f; if (k != null) { return k; } final Set<String> n; if (s == null) { n = Set.copyOf(new HashSet<String>()); } else { final Set<String> m = new HashSet<>(s.keySet()); n = Set.copyOf(m); } f = n; return n; } }
  public static class V3 { private Set<String> f; public Set<String> get() { final Set<String> k = f; if (k != null) { return k; } f = Set.of("a"); return f; } }
  public static class V4 { private Set<String> f; public void m(boolean c) { Set<String> n; if (c) { n = Set.of("a"); } else { n = Set.of("b"); } f = n; } public Set<String> get() { return f; } }
  public static class V5 { private Set<String> f; public void m(boolean c) { Set<String> n = Set.of("a"); if (c) { n = Set.of("b"); } f = n; } public Set<String> get() { return f; } }
  public static class Mid { private List<String> un = new ArrayList<>(); public void setX(int x) { }
    public class It { private int q; public It() { q = un.size(); } public int q() { return q + un.size(); } } }
  public class In1 { private int q; public void setX(int x) { }
    public class In2 { public In2() { q = 1; } public int q() { return q; } } }
  public class In3 { private int q;
    public In3(int a,
        int b) {
      q = a; } public int q() { return q + G.this.hashCode(); } }
  public void setY(int y) { }
  public static class X1 { private Mut head; private Mut tail; public X1 add(Mut h) { if (h == null) { return this; } if (head == null) { head = h; tail = h; } else { tail.setV(1); tail = h; } return this; } }
  public static class X2 { private Mut a; public void m(Mut h, boolean c) { if (c) { a = h; } else { a = h; } } }
  public static class X3 { private Mut a; public void m(Mut h, Mut k) { a = h; a = k; } }
  public static class Y1 { private final Object v; public Y1(Collection<?> p) { if (p instanceof ArrayList<?> al) { this.v = al; } else { this.v = new ArrayList<>(p); } } }
  public static class Y2 { private final Mut v; private final Object w; public Y2(Object p) { this.w = Objects.requireNonNull(p); if (p instanceof Mut m) { this.v = m; } else { this.v = null; } } }
  public static class Y3 { private Mut v; public void m(Object p) { if (!(p instanceof Mut m)) { return; } v = m; } }
  public static class Y4 { private Mut v; public void m(Object p) { if (p instanceof Mut m && m.v > 0) { v = m; } } }
  public static class Y5 { private Mut v; public void m(Object p) { Mut q = p instanceof Mut m ? m : null; v = q; } }
}
