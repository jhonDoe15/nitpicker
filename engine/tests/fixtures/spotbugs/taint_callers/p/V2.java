package p;
import java.io.*;
public class V2 {
  private void h1(String p) { new File(p); }
  public void c1() { h1("a"); }
  public void h2(String p) { new File(p); }
  public void c2() { h2("a"); }
  public void h3(String p) { new File(p); }
  public void c3(String s) { h3(s); }
  public void h4(String... p) { new File(p[0]); }
  public void c4() { h4("a", "b"); }
  public void h5(Object o, String... p) { new File(p[0]); }
  public void c5() { h5(null, "a"); }
  public void h6(String p) { new File(p); }
  public void c6() { h6("a"); }
  public void c7(String s) { h6(s); }
}
