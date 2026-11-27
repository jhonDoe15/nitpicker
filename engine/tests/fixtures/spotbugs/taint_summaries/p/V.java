package p;
import java.io.File;
public class V {
  public String early(String s) { return "z"; }
  public String early0() { return "z"; }
  public final String earlyFinal(String s) { return "z"; }
  public void c1(String s) { new File(early(s)); }
  public void c2(String s) { new File(early0()); }
  public void c3(String s) { new File(late(s)); }
  public void c4(String s) { new File(late0()); }
  public void c5(String s) { new File(earlyFinal(s)); }
  public void c6(String s) { new File(lateStatic(s)); }
  public void c7(String s) { new File(latePriv(s)); }
  public void c8(W w, String s) { new File(w.f(s)); }
  public void c9(W w, String s) { new File(w.g()); }
  public void c10(String s) { new File(W.h(s)); }
  public void c11(String s) { new File(lateIgnores(s, "a")); }
  public void c12(String s) { new File(lateSecond("a", s)); }
  public void c13(String s) { new File(lateFirst(s, "a")); }
  public void c14(String s) { new File(earlyFinal("lit")); }
  public void c15(String s) { new File(early("lit")); }
  public String late(String s) { return "z"; }
  public String late0() { return "z"; }
  public static String lateStatic(String s) { return "z"; }
  private String latePriv(String s) { return "z"; }
  private String lateIgnores(String s, String t) { return t; }
  private String lateSecond(String s, String t) { return t; }
  private String lateFirst(String s, String t) { return s; }
}
class W {
  String f(String s) { return "q"; }
  String g() { return "q"; }
  static String h(String s) { return "q"; }
}
