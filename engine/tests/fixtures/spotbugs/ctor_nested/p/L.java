package p;
import java.io.*;
import java.util.concurrent.*;
public class L {
  static void m() throws IOException {}
  static void x() {}
  static void u() { throw new IllegalStateException(); }
  public static class L1 { public L1() { try { try { m(); } catch (RuntimeException e) { x(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class L2 { public L2(Closeable c) { try { try (c) { m(); } } catch (Exception e) { x(); } } }
  public static class L3 { public L3() { try { try { try { m(); } catch (RuntimeException e) { x(); } } finally { x(); } } catch (IOException e) { x(); } } }
  public static class L4 { public L4() { try { synchronized (L.class) { m(); } } catch (IOException e) { x(); } } }
  public static class L5 { public L5() { try { try { throw new IOException(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class L6 { public L6() { try { try { u(); } finally { x(); } } catch (Exception e) { x(); } } }
  public static class L7 { public L7() { try { try { x(); } finally { x(); } } catch (Exception e) { x(); } } }
  public static class L8 { public L8() { try { try { m(); } finally { } } catch (IOException e) { x(); } } }
  public static class L9 { public L9() { try { try { x(); } finally { x(); } m(); } catch (IOException e) { x(); } } }
  public static class N1 { public N1() { h(1); }
    private static void h(int n) { try { for (int i = 0; i < n; i++) { try { g(i); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } } finally { x(); } }
    private static void g(int i) throws Exception { try { m(); } catch (IOException e) { x(); throw new TimeoutException("t"); } } }
  public static class N2 { public N2() { h(); } private static void h() { Callable<Object> c = () -> { m(); return null; }; x(); } }
  public static class N3 { public N3() { h(); } private static void h() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } }
    private static void g() throws Exception { m(); } }
  public static class N4 { public N4() { h(); } private static void h() { try { g(); } catch (Exception e) { x(); } }
    private static void g() throws Exception { try { m(); } catch (IOException e) { throw new TimeoutException("t"); } } }
  public static class N5 { private final Object f; public N5() { this.f = new Object[] { h() }; } private static Object h() { try { m(); } catch (Exception e) { x(); } return null; } }
}
