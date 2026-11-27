package p;
import java.io.*;
import java.util.*;
public class A {
  void io2() throws IOException, InterruptedException {}
  static void log(Object o) {}
  void pst() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { e.printStackTrace(); } }
  void pstS() { try { io2(); } catch (Exception e) { e.printStackTrace(); } }
  void log() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e); } }
  void logS() { try { io2(); } catch (Exception e) { log(e); } }
  void wrap() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw new RuntimeException(e); } }
  void wrapS() { try { io2(); } catch (Exception e) { throw new RuntimeException(e); } }
  void msg() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw new RuntimeException("x"); } }
  void msgS() { try { io2(); } catch (Exception e) { throw new RuntimeException("x"); } }
  void re() throws Exception { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw e; } }
  void reS() throws Exception { try { io2(); } catch (Exception e) { throw e; } }
  void getm() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e.getMessage()); } }
  void getmS() { try { io2(); } catch (Exception e) { log(e.getMessage()); } }
  void nothrow() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { RuntimeException r = new RuntimeException(e); } }
  void nothrowS() { try { io2(); } catch (Exception e) { RuntimeException r = new RuntimeException(e); } }
  void ret() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { return; } }
  void retS() { try { io2(); } catch (Exception e) { return; } }
  void wrapmsg() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw new RuntimeException(e.getMessage()); } }
  void wrapmsgS() { try { io2(); } catch (Exception e) { throw new RuntimeException(e.getMessage()); } }
  void err() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw new Error(e); } }
  void errS() { try { io2(); } catch (Exception e) { throw new Error(e); } }
  void ill() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { throw new IllegalStateException("a", e); } }
  void illS() { try { io2(); } catch (Exception e) { throw new IllegalStateException("a", e); } }
  void catchRtBig() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (RuntimeException e) {} catch (Exception e) {} }
  void two() { int v = 0; try { io2(); } catch (Exception e) {}
    try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
}