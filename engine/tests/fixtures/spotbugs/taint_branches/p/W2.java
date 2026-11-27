package p;
import java.io.*;
import java.util.*;
public class W2 {
  Map<String, Object> m = new HashMap<>();
  public void n1(Object l, String... ps) throws IOException {
    for (String p : ps) {
      if (p != null && new File(p).exists()) {
        m.put(p, l);
        InputStream in = null;
        try {
          m.put(p, in.read());
        } finally {
          if (in != null) in.close();
        }
      }
    }
  }
  public void n2(Object l, String... ps) throws IOException {
    for (String p : ps) {
      if (p != null && new File(p).exists()) {
        m.put(p, l);
      }
    }
  }
  public void n3(String... ps) {
    for (String p : ps) {
      if (new File(p).exists()) { m.put(p, p); }
    }
  }
  public void n4(String p) {
    if (p != null && new File(p).exists()) { m.put(p, p); }
  }
  public void n5(String p) {
    if (new File(p).exists()) { }
  }
  public void n6(String p) {
    boolean b = new File(p).exists();
  }
  public void n7(String p) {
    new File(p).exists();
  }
}
