package p;
import java.io.*;
public class P {
  static void m() throws IOException {}
  static void x() {}
  public static class P1 { public P1() { h(); } private static void h() { try { m(); } catch (FileNotFoundException e) { x(); } catch (IOException e) { x(); } } }
  public static class P2 { public P2() { h(); } private static void h() { try { m(); } catch (IllegalArgumentException e) { x(); } catch (IOException e) { x(); } } }
  public static class P3 { public P3() { h(); } private static void h() { try { m(); } catch (IOException e) { x(); } catch (IllegalArgumentException e) { x(); } } }
  public static class P4 { public P4() { h(); } private static void h() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } private static void g() throws Exception { } }
  public static class P5 { public P5() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } private static void g() throws Exception { m(); } }
  public static class P6 { public P6() { h(); } private static void h() { try { g(); } catch (Exception e) { x(); } } private static void g() throws Exception { m(); } }
  public static class P7 { public P7() { h(); } private static void h() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } private static void g() { throw new IllegalStateException(); } }
  public static class P8 { public P8() { h(); } private static void h() { try { throw new IOException(); } catch (IllegalArgumentException e) { x(); } catch (IOException e) { x(); } } }
  public static class P9 { public P9() { h(); } private static void h() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (IOException e) { x(); } } private static void g() throws IOException { m(); } }
  public static class P10 { public P10() { h(); } private static void h() { try { g(); } catch (IllegalArgumentException e) { x(); } catch (Exception e) { x(); } } private static void g() throws Exception { throw new Exception(); } }
  public static class P11 { public P11() { h(); } private static void h() { try { g(); } catch (Exception e) { x(); } catch (Throwable e) { x(); } } private static void g() throws Exception { m(); } }
  public static class P12 { public P12() { h(); } private static void h() { try { g(); } catch (IOException e) { x(); } catch (Exception e) { x(); } } private static void g() throws Exception { m(); } }
  public static class P13 { public P13() { h(); } private static void h() { try { g(); } catch (RuntimeException e) { x(); } catch (IOException e) { x(); } } private static void g() throws IOException { throw new IOException(); } }
}
