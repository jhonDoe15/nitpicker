package p;
import java.util.*;
public class A {
  private Map<Object, Object> keyMap = new HashMap<>();
  Map<Object, Object> pub = new HashMap<>();
  static Map<Object, Object> st = new HashMap<>();
  public Object a(Object key) { keyMap.get(key); return null; }
  public Object b(Object key) { pub.get(key); return null; }
  public Object c(Object key) { st.get(key); return null; }
  public Object d(Map<Object,Object> m, Object key) { m.get(key); return null; }
  public Object e(Object key) { Map<Object,Object> m = keyMap; m.get(key); return null; }
  public void f(Object key) { keyMap.get(key); }
  public Object g(Object key) { this.keyMap.get(key); return key; }
  public Object h(Object key) { keyMap.containsKey(key); return null; }
  public Object i(Object key) { keyMap.size(); return null; }
  public Object j(String s) { s.trim(); return null; }
  public Object k(String s) { s.length(); return null; }
  public Object l(List<String> s) { s.get(0); return null; }
  public Object m(List<String> s) { s.size(); return null; }
  public Object n(StringBuilder s) { s.toString(); return null; }
  public Object o(Object s) { s.toString(); return null; }
  public Object q(Object s) { s.hashCode(); return null; }
  public Object r(Integer s) { s.intValue(); return null; }
  public Object t(Optional<String> s) { s.isPresent(); return null; }
}
