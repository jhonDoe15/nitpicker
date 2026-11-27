package p;
import java.util.*;
public class A {
  public int a(List<String> l) { l.size(); return 1; }
  public long b(List<String> l) { l.size(); return 1; }
  public Integer c(List<String> l) { l.size(); return 1; }
  public CharSequence d(String s) { s.toUpperCase(Locale.ROOT); return null; }
  public Object e(String s) { s.toUpperCase(Locale.ROOT); return null; }
  public List<String> f(List<String> l) { l.subList(0, 1); return null; }
  public Collection<String> g(List<String> l) { l.subList(0, 1); return null; }
  public ArrayList<String> h(List<String> l) { l.subList(0, 1); return null; }
  public boolean i(List<String> l) { l.isEmpty(); return true; }
  public int j(List<String> l) { l.isEmpty(); return 1; }
  public String k(String s) { s.toUpperCase(Locale.ROOT); return null; }
  public Object[] m(List<String> l) { l.toArray(); return null; }
  public Object n(List<String> l) { l.toArray(); return null; }
  public String[] o(List<String> l) { l.toArray(new String[0]); return null; }
}
