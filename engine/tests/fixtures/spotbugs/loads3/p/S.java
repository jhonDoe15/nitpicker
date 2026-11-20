package p;
import java.util.*;
public class S {
  public static class C1 { private final Map<String, String> f; public C1(Map<String, String> p) { f = Collections.unmodifiableMap(p); } protected C1(C1 o) { f = o.f; } public Map<String, String> get() { return f; } }
  public static class C2 { private final List<String> f; public C2(List<String> p) { f = Collections.unmodifiableList(p); } protected C2(C2 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C3 { private final List<String> f; public C3(List<String> p) { f = List.copyOf(p); } protected C3(C3 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C4 { private final List<String> f; public C4(List<String> p) { f = Collections.emptyList(); } protected C4(C4 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C5 { private final List<String> f; public C5(List<String> p) { f = Collections.unmodifiableList(new ArrayList<>(p)); } protected C5(C5 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C6 { private List<String> f = Collections.emptyList(); private List<String> g; public C6(List<String> p) { g = Collections.unmodifiableList(p); } public void m() { f = g; } public List<String> get() { return f; } }
  public static class C7 { private final List<String> f; public C7(List<String> p) { f = Collections.unmodifiableList(p); } public List<String> get() { return f; } }
  public static class C8 { private final Map<String, String> f; public C8(Map<String, String> p) { f = Collections.unmodifiableMap(p); } public Map<String, String> get() { return f; } }
  public static class C9 { private final List<String> f; public C9(String[] p) { f = List.of(p); } protected C9(C9 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C10 { private final List<String> f; public C10(List<String> p) { f = Collections.singletonList("a"); } protected C10(C10 o) { f = o.f; } public List<String> get() { return f; } }
  public static class C11 { private final List<String> f; protected C11(C11 o) { f = o.f; } public C11(List<String> p) { f = Collections.unmodifiableList(p); } public List<String> get() { return f; } }
  public static class C12 { private final List<String> f; public C12(List<String> p) { f = Collections.unmodifiableList(p); } protected C12(C12 o) { this.f = o.f; } public List<String> get() { return f; } public List<String> two(C12 o) { return o.f; } }
  public static class C13 { private final List<String> f; public C13(List<String> p) { f = Collections.unmodifiableList(p); } protected C13(C13 o, int k) { List<String> t = o.f; f = t; } public List<String> get() { return f; } }
  public static class C14 { private final List<String> f; public C14(List<String> p, int a, Object b, Object c) { f = Collections.unmodifiableList(p); } protected C14(C14 o) { f = o.f; } public List<String> get() { return f; } }
}
