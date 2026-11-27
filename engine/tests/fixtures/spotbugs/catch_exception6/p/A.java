package p;
import java.io.*;
public class A {
  void io2() throws IOException, InterruptedException {}
  void io() throws IOException {}
  void fnf() throws FileNotFoundException {}
  void thr() throws Throwable {}
  void a29() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v += 1; } catch (Exception e) {} }
  void loop60(int n) { int v = 0; try { io2(); for (int i = 0; i < n; i++) { v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } } catch (Exception e) {} }
  void loopAfter(int n) { int v = 0; try { v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; io2(); for (int i = 0; i < n; i++) { v = 1; } } catch (Exception e) {} }
  void fnfio() { try { fnf(); io(); } catch (Exception e) {} }
  void catchIo() { try { io2(); } catch (IOException e) {} catch (Exception e) {} }
  void catchRt() { try { io2(); } catch (RuntimeException e) {} catch (Exception e) {} }
  void catchIae() { try { io2(); } catch (IllegalStateException e) {} catch (Exception e) {} }
  void multiErr() { try { io2(); } catch (Exception | Error e) {} }
  void nested() { try { try { io2(); } catch (IOException e) {} } catch (Exception e) {} }
  void nested2() { try { try { io2(); } catch (IOException e) {} io(); } catch (Exception e) {} }
  void throwable() throws Throwable { try { thr(); io(); } catch (Exception e) {} }
  void fin() { try { io2(); } catch (Exception e) {} finally { System.out.println(); } }
  void fin2() { try { try { io2(); } finally { System.out.println(); } } catch (Exception e) {} }
  void sync() { try { synchronized (this) { io2(); } } catch (Exception e) {} }
  void rethrow() throws Exception { try { io2(); } catch (Exception e) { throw e; } }
  void ioTwice() { try { io(); io(); } catch (Exception e) {} }
  void lambda() { try { io2(); Runnable r = () -> {}; } catch (Exception e) {} }
  void rtDecl() { try { Integer.parseInt("1"); Integer.parseInt("2"); } catch (Exception e) {} }
  void rt2() { try { Integer.parseInt("1"); Class.forName("x"); } catch (Exception e) {} }
  void sleep() { try { Thread.sleep(1); } catch (Exception e) {} }
  void fn() { try { new FileInputStream("x").read(); } catch (Exception e) {} }
}