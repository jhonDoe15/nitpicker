package p;
import java.io.File;
import java.util.*;
public class K {
  public void j1(String s) { StringBuilder b = new StringBuilder(); b.append("x").append(s); new File(b.toString()); }
  public void j2(String s) { StringBuilder b = new StringBuilder(); StringBuilder c = b; c.append(s); new File(b.toString()); }
  public void j3() { String x = "a"; Runnable r = () -> new File(x); }
  public void j4() { List<String> l = new ArrayList<>(); l.add("a"); for (String s : l) new File(s); }
  public void j5(String s) { List<String> l = new ArrayList<>(); l.add(s); for (String t : l) new File(t); }
  public void j6() { new File(rec("a", 3)); }
  private String rec(String s, int n) { return n == 0 ? s : rec(s, n - 1); }
  public void j7(String s) { Map<String,String> m = new HashMap<>(); m.put(s, "v"); new File(m.get("k")); }
  public void j8(String s) { Map<String,String> m = new HashMap<>(); m.put("k", "v"); new File(m.get(s)); }
  public void j9() { StringBuilder b = new StringBuilder("a"); q.M.touch(b); new File(b.toString()); }
  public void j10() { List<String> l = new ArrayList<>(); l.add("a"); q.M.touchList(l); new File(l.get(0)); }
  public void j11() { StringBuilder b = new StringBuilder("a"); own(b); new File(b.toString()); }
  private void own(StringBuilder b) { b.append("k"); }
  public void j12(String s) { List<String> l = new ArrayList<>(); l.addAll(Arrays.asList(s)); new File(l.get(0)); }
  public void j13() { String s = "a"; s = s.trim(); new File(s); }
  public void j14(List<String> in) { List<String> l = new ArrayList<>(in); new File(l.get(0)); }
  public void j15() { List<String> l = new ArrayList<>(Arrays.asList("a")); new File(l.get(0)); }
  public void j16() { Object o = new Object() { public String toString() { return "a"; } }; new File(o.toString()); }
  public void j17() { String x = "a"; Object o = new Object() { void f() { new File(x); } }; }
  public void j18(String s) { new File(s == null ? "a" : "b"); }
  public void j19(String s) { String t; switch (s) { case "a": t = "x"; break; default: t = "y"; } new File(t); }
  public void j20(int i) { String t = switch (i) { case 1 -> "x"; default -> "y"; }; new File(t); }
  public void j21(String s) { StringBuilder b = new StringBuilder(); b.append("a"); b.setLength(0); b.append(s); b.setLength(0); new File(b.toString()); }
  public void j22(String s) { char[] c = new char[] {'a'}; new File(String.valueOf(c)); }
  public void j23(String s) { String[] a = {"a", "b"}; new File(a[1]); }
  public void j24(String s) { String[] a = {"a", s}; new File(a[0]); }
  public void j25(String s) { new File(String.join(",", List.of("a"))); }
  public void j26(String s) { new File(Objects.requireNonNull("a")); }
  public void j27(String s) { new File(Objects.requireNonNull(s)); }
  public void j28(String s) { new File(Optional.ofNullable("a").orElse("b")); }
}
