package p;
import java.io.*;
public class V5 {
  public void h1(String p) { new File(p); }
  public void a1() { new Object() { void x() { h1("a"); } }; }
  public static void h2(String p) { new File(p); }
  static class N { void x() { h2("a"); } }
  public void h3(String p) { new File(p); }
  class I { void x() { h3("a"); } }
  public static void h4(String p) { new File(p); }
  public void a4() { new Object() { void x() { h4("a"); } }; }
  public void h5(String p) { new File(p); }
  public void a5() { Runnable r = new Runnable() { public void run() { h5("a"); } }; r.run(); }
  public static void h6(String p) { new File(p); }
}
class Z5 { void x() { V5.h6("a"); } }
