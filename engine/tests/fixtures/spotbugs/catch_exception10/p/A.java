package p;
import java.io.*;
import java.util.*;
public class A {
  void io2() throws IOException, InterruptedException {}
  static void log(Object o) {}
  int firstSmall(boolean c) { int v = 0; try { io2(); if (c) return 1; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} return v; }
  int firstBig(boolean c) { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0;  if (c) return 1; v = 1; } catch (Exception e) {} return v; }
  int mid(boolean c) { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; if (c) return 1; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} return v; }
  void rtOnly(String s) { try { Integer.parseInt(s); if (s == null) throw new IllegalStateException(); } catch (Exception e) {} }
  void rtOnlyBig(String s) { int v = 0; try { Integer.parseInt(s); if (s == null) throw new IllegalStateException(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0;  } catch (Exception e) {} }
  void throwEx(String s) throws Exception { try { io2(); if (s == null) throw new Exception(); } catch (Exception e) {} }
  void finalE() { try { io2(); } catch (final Exception e) {} }
  void unusedAssign() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { e = null; } }
  void lambdaUse() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { Runnable r = () -> log(e); } }
  void varName() { int v = 0; try { io2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception ignored) { } }
}