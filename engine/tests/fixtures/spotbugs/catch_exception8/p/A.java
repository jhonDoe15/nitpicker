package p;
import java.io.*;
import java.util.*;
public class A {
  void io2() throws IOException, InterruptedException {}
  void io() throws IOException {}
  void a29() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v += 1; } catch (Exception e) {} }
  void a29b() { int v = 0; try { io(); io(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v += 1; } catch (Exception e) {} }
  void catchIoBig() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (IOException e) {} catch (Exception e) {} }
  void catchIseBig() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (IllegalStateException e) {} catch (Exception e) {} }
  void catchErrBig() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Error e) {} catch (Exception e) {} }
  void afterBig() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} catch (Throwable e) {} }
  void rethrow() throws Exception { try { io2(); } catch (Exception e) { throw e; } }
  void rethrowWrap() { try { io2(); } catch (Exception e) { throw new RuntimeException(e); } }
  void rethrowLater() throws Exception { try { io2(); } catch (Exception e) { System.out.println(); throw e; } }
  void rethrowCond(boolean c) throws Exception { try { io2(); } catch (Exception e) { if (c) throw e; } }
  void multi() {
    try {
      io2();
    }
    catch
      (Exception
        e) {
      System.out.println();
    }
  }
  int split(boolean c) {
    int v = 0;
    try {
      io2();
      if (c) { return 1; }
      v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0;
    } catch (Exception e) {
      v = 3;
    } finally {
      v = 2; v = 2; v = 2; v = 2; v = 2; v = 2; v = 2; v = 2; v = 2; v = 2;
    }
    return v;
  }
  void two() {
    try { io2(); } catch (Exception e) {}
    try { io2(); } catch (Exception e) {}
  }
}