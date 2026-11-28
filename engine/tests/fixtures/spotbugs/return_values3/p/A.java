package p;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
public class A {
  static class MyFile extends File { MyFile() { super("x"); } }
  static class MyFile2 extends File { MyFile2() { super("x"); } public boolean delete() { return true; } }
  static class MyQ extends ArrayBlockingQueue<String> { MyQ() { super(1); } }
  static class MyLQ extends LinkedBlockingQueue<String> { }
  void a(MyFile f, MyFile2 g, MyQ q, MyLQ lq) { f.delete(); g.delete(); q.offer("a"); lq.offer("b"); }
  void b(File f) { try { f.delete(); } catch (IllegalStateException e) {} }
  void c(File f) throws IOException { try { f.createNewFile(); } catch (FileNotFoundException e) {} }
  void d(File f) { try { f.exists(); } catch (Throwable t) {} }
  void e(File f) { try { f.exists(); f.exists(); } catch (Throwable t) {} }
  void g(File f) { try { f.delete(); } catch (Throwable t) {} f.delete(); }
  Runnable h(File f) { return () -> f.delete(); }
  void i(File f, boolean c) { if (c) f.delete(); else f.mkdir(); }
  void j(File f) { f.delete(); f.delete(); }
  void k(File f) { synchronized (this) { f.delete(); } }
  void l(File f) { try (InputStream in = new FileInputStream(f)) { f.delete(); } catch (IOException e) {} }
  void m(File f) throws IOException { try (InputStream in = new FileInputStream(f)) { f.delete(); } }
  void n(File f) { try { System.out.println(); } catch (Throwable t) { f.delete(); } }
  void o(File f) { try { System.out.println(); } finally { f.delete(); } }
  void q(File f) {
    f.delete();
    try { f.delete(); } catch (Throwable t) {}
  }
  static { new File("a").delete(); }
  boolean r(File f) { return f.delete() || f.delete(); }
  void s(File f) { Object o = f.delete(); }
  void t(File f) { new File("a").delete(); }
  void u(File[] fs) { for (File f : fs) f.delete(); }
}
