package p;
import java.io.*;
import java.util.*;
public class A {
  void io() throws IOException {}
  void io2() throws IOException, InterruptedException {}
  void ex() throws Exception {}
  void none() {}
  void a() { try { none(); } catch (Exception e) {} }
  void b() { try { io(); } catch (Exception e) {} }
  void c() { try { io2(); } catch (Exception e) {} }
  void d() { try { ex(); } catch (Exception e) {} }
  void e() { try { io(); } catch (RuntimeException r) {} catch (Exception e) {} }
  void f() { try { for (int i = 0; i < 3; i++) io(); } catch (Exception e) {} }
  void g() { try { io(); io(); } catch (Exception e) {} }
  void h() { try { io(); Thread.sleep(1); } catch (Exception e) {} }
  void i() { try { io(); } catch (Exception e) { throw new RuntimeException(e); } }
  void j() { try { io(); } catch (IOException | RuntimeException e) {} }
  void k() { try { io(); } catch (Throwable t) {} }
  void l() { try { io(); } catch (Exception e) { e.printStackTrace(); } }
  void m() { try { System.out.println(); } catch (Exception e) {} }
  void n() { try { int x = 1; } catch (Exception e) {} }
  void o() { try { Class.forName("x"); } catch (Exception e) {} }
  void q() { try { Class.forName("x"); Class.forName("y"); } catch (Exception e) {} }
  void r() { try { Class.forName("x").getMethod("m").invoke(null); } catch (Exception e) {} }
  void s() { try { if (Math.random() > 0.5) throw new IOException(); } catch (Exception e) {} }
  void t() { try { while (true) { io(); break; } } catch (Exception e) {} }
  void u() { try (InputStream in = new FileInputStream("x")) { in.read(); } catch (Exception e) {} }
  void v() { try { io(); } catch (IOException e) {} catch (Exception e) {} }
  void w() { try { try { io(); } catch (IOException e) {} } catch (Exception e) {} }
  void x() { try { new FileInputStream("x"); } catch (Exception e) {} }
  void y() {
    try {
      io();
    } catch (Exception e) {
      none();
    }
  }
  void z(List<String> l) { try { for (String s : l) io(); } catch (Exception e) {} }
}
