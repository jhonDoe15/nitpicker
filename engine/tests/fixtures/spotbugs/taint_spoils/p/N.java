package p;
import java.io.File;
import java.util.*;
public class N {
  public void k1() { String x = "a"; q.L.c(x); new File(x); }
  public void k2() { StringBuilder b = new StringBuilder("a"); String.valueOf(b); new File(b.toString()); }
  public void k3() { StringBuilder b = new StringBuilder("a"); nothing(b); new File(b.toString()); }
  private void nothing(StringBuilder b) { }
  public void k4() { StringBuilder b = new StringBuilder("a"); System.out.println(b); new File(b.toString()); }
  public void k5() { List<String> l = new ArrayList<>(); l.add("a"); Collections.sort(l); new File(l.get(0)); }
  public void k6() { List<String> l = new ArrayList<>(); l.add("a"); l.size(); new File(l.get(0)); }
  public void k7() { List<String> l = new ArrayList<>(); l.add("a"); Iface.take(l); new File(l.get(0)); }
  public void k8(Iface i) { List<String> l = new ArrayList<>(); l.add("a"); i.inst(l); new File(l.get(0)); }
  public void k9() { Object[] a = {"a"}; q.L.obj("x"); new File((String) a[0]); }
  public void k10() { String[] a = {"a"}; Arrays.sort(a); new File(a[0]); }
  public void k11() { String[] a = {"a"}; q.L.arr(a); new File(a[0]); }
  public void k12() { Integer i = 1; q.L.c(String.valueOf(i)); new File(String.valueOf(i)); }
  public void k13() { StringBuilder b = new StringBuilder("a"); b.length(); new File(b.toString()); }
  public void k14() { StringBuilder b = new StringBuilder("a"); b.charAt(0); new File(b.toString()); }
}
interface Iface { static void take(List<String> l) { } void inst(List<String> l); }
