package p;
import java.io.File;
import java.net.*;
public class Q {
  public void l1(String... a) { for (String s : a) new File(s); }
  public void l2(String... a) { new File(a[0]); }
  public void l3(ClassLoader c, String r) { new File(c.getResource(r).getFile()); }
  public void l4(ClassLoader c) { new File(c.getResource("a").getFile()); }
  public void l5(String r) { new File(ClassLoader.getSystemResource(r).getFile()); }
  public void l6(URL u) { new File(u.getFile()); }
  public void l7() throws Exception { new File(new URL("http://a").getFile()); }
  public void l8(String s) throws Exception { new File(new URL(s).getFile()); }
  public void l10(URL u) { new File(u.getPath()); }
  public void l11(String s) {
    new File(
      s
        + q.L.k());
  }
  public void l12(String s) {
    new File(
      s);
  }
  public void l13(String s) {
    new File(s
      + "x"
      + "y");
  }
  public void l14(int n, String s) { String[] a = new String[n]; new File(a[0]); }
  public void l15(String a, String... b) { new File(b[0] + a); }
  public void l16(String a, String... b) { for (String s : b) new File(s.trim()); }
}
