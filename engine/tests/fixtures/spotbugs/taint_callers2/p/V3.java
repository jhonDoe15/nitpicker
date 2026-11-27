package p;
import java.io.*;
public class V3 {
  public void h7(String p) { new File(p); }
  public void c8(String s) { h7(s); }
  public void c9() { h7("a"); }
  public void c10() { h8("a"); }
  public void c11(String s) { h8(s); }
  public void h8(String p) { new File(p); }
  public void h9(String p) { new File(p); }
  public void h10(String p, String q) { new File(p); new File(q); }
  public void c12(String s) { h10("a", s); }
  public void h11(String p) { new File(p + "x"); }
  public void c13() { h11("a"); }
  public void h12(String p) { String t = p.trim(); new File(t); }
  public void c14() { h12("a"); }
  public void h13(String p) { new File(p); }
  public void c15() { h13(q.L.k()); }
  public void h14(String p) { new File(p); }
  public void c16() { h15("a"); }
  public void h15(String p) { h14(p); }
}
class Other3 {
  void c(V3 v) { v.h9("a"); }
}
