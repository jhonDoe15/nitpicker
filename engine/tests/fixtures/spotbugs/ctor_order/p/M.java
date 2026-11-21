package p;
import java.io.*;
public class M {
  static void m() throws IOException {}
  static void x() {}
  static void u() { throw new IllegalStateException(); }
  public static class M1 { public M1() { try { try { m(); } catch (RuntimeException e) { x(); } } catch (IOException e) { x(); } } }
  public static class M2 { public M2(Closeable c) throws IOException { try (c) { m(); } } }
  public static class M3 { public M3() { try { m(); } catch (FileNotFoundException e) { x(); } catch (IOException e) { x(); } } }
  public static class M4 { public M4() { try { m(); } catch (IllegalStateException | IOException e) { x(); } } }
  public static class M5 { public M5() { try { m(); } catch (IOException | IllegalStateException e) { x(); } } }
  public static class M6 { public M6() { try { try { x(); } catch (RuntimeException e) { m(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class M7 { public M7() { try { try { x(); } catch (RuntimeException e) { m(); } } catch (IOException e) { x(); } } }
  public static class M8 { public M8() { try { throw new IOException(); } catch (RuntimeException e) { x(); } catch (IOException e) { x(); } } }
  public static class M9 { public M9() { try { try { throw new IllegalStateException(); } finally { x(); } } catch (RuntimeException e) { x(); } } }
  public static class M10 { public M10() { try { u(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } }
  public static class M11 { public M11() { try { synchronized (M.class) { u(); } } catch (Exception e) { x(); } } }
  public static class M12 { public M12() { u(); } }
  public static class M13 { public M13(Closeable c) throws IOException { try (c) { throw new IllegalStateException(); } } }
  public static class M14 { public M14(Closeable c) { try { try (c) { m(); } catch (RuntimeException e) { x(); } } catch (IOException e) { x(); } } }
  public static class M15 { public M15() { try { m(); } catch (Exception e) { x(); } } }
  public static class M16 { public M16() { try { m(); } catch (Throwable e) { x(); } } }
  public static class M17 { public M17() { try { throw new IllegalStateException(); } catch (IllegalArgumentException e) { x(); } catch (RuntimeException e) { x(); } } }
  public static class M18 { public M18() { h(); } private void h() { try { u(); } finally { x(); } } }
  public static class M19 { public M19() { try { h(); } catch (RuntimeException e) { x(); } } private void h() { try { m(); } catch (IOException e) { throw new UncheckedIOException(e); } } }
}
