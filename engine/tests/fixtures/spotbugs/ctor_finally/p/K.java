package p;
import java.io.*;
public class K {
  static void m() throws IOException {}
  static void x() {}
  public static class K1 { public K1() { try { try { m(); } catch (Exception e) { x(); } } finally { x(); } } }
  public static class K2 { public K2() { try { try { m(); } finally { x(); } } catch (IOException e) { throw new UncheckedIOException(e); } } }
  public static class K3 { public K3() { try { try { m(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class K4 { public K4() { try { m(); } catch (Exception e) { x(); } finally { x(); } } }
  public static class K5 { public K5() { try { m(); } catch (IOException e) { x(); } } }
  public static class K6 { public K6(Closeable c) { try (c) { m(); } catch (Exception e) { x(); } } }
  public static class K7 { public K7() { synchronized (K.class) { try { m(); } catch (Exception e) { x(); } } } }
  public static class K8 { public K8() { try { try { throw new IOException(); } catch (IOException e) { x(); } } finally { x(); } } }
  public static class K9 { public K9() { try { m(); } catch (Exception e) { x(); } try { x(); } finally { x(); } } }
  public static class K11 { public K11() { h(); } private static void h() { try { try { m(); } catch (Exception e) { x(); } } finally { x(); } } }
  public static class K12 { public K12() { try { try { x(); } catch (Exception e) { x(); } } finally { x(); } } }
  public static class K13 { public K13() { try { m(); } catch (IOException e) { throw new UncheckedIOException(e); } } }
  public static class K14 { public K14() { try { try { m(); } catch (IOException e) { x(); } } catch (RuntimeException e) { x(); } } }
  public static class K15 { public K15() { h(); } private static void h() { try { m(); } catch (Exception e) { x(); } } }
  public static class K16 { public K16() throws IOException { try { m(); } finally { x(); } } }
  public static class K17 { public K17() { try { try { m(); } finally { x(); } } catch (Exception e) { x(); } } }
  public static class K18 { public K18() { try { try { m(); } finally { x(); } } catch (Throwable e) { x(); } } }
}
