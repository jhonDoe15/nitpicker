package p;
import java.util.*;
public class A {
  Map<Object, Object> m = new HashMap<>();
  static void x() { System.out.println(); }
  public int a(Object key) { m.get(key); return 1; }
  public String b(Object key) { m.get(key); return null; }
  public Object c(List<String> l) { l.size(); return null; }
  public Object d(Object key) { m.get(key); x(); return null; }
  public void e(Object key) { m.get(key); x(); }
  public Object f(Object key) { m.get(key); x(); return 3; }
  public Object g(Object key, boolean c) { if (c) m.get(key); return null; }
  public Object h(Object key) { m.get(key); int y = 1; return null; }
  public static Object i(Map<Object,Object> mm, Object key) { mm.get(key); return null; }
  public void j(Object key) { m.get(key); return; }
  public void k(Object key) { m.get(key); if (key == null) x(); }
  public void l(Object key) { if (key == null) x(); m.get(key); }
  public void n(Object key) { x(); m.get(key); }
  public void o(Object key) { m.get(key); x(); x(); }
  public void q(Object key) { m.get(key).hashCode(); m.get(key); }
}
