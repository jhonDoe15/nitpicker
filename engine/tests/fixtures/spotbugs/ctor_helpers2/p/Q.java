package p;
import java.io.*;
public class Q {
  static void m() throws IOException {}
  static void x() {}
  public static class Q1 { public Q1() { h(); } private static void h() { try { try { m(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class Q2 { public Q2() { h(); } private static void h() { try { m(); } catch (IOException e) { x(); } finally { x(); } } }
  public static class Q3 { public Q3() { h(); } private static void h() { try { try { m(); } catch (RuntimeException e) { x(); } } catch (IOException e) { x(); } } }
  public static class Q4 { public Q4() { h(); } private static void h() { try { try { m(); } catch (IOException e) { x(); } } catch (RuntimeException e) { x(); } } }
  public static class Q5 { public Q5() { h(); } private static void h() { synchronized (Q.class) { try { m(); } catch (IOException e) { x(); } } } }
  public static class Q6 { public Q6() { h(); } private static void h() { try { synchronized (Q.class) { m(); } } catch (IOException e) { x(); } } }
  public static class Q7 { public Q7(Closeable c) { h(c); } private static void h(Closeable c) { try (c) { m(); } catch (Exception e) { x(); } } }
  public static class Q8 { public Q8() { h(); } private static void h() { try { try { throw new IOException(); } catch (RuntimeException e) { x(); } } catch (IOException e) { x(); } } }
  public static class Q9 { public Q9() { h(); } private static void h() { try { try { throw new IOException(); } finally { x(); } } catch (IOException e) { x(); } } }
  public static class Q10 { public Q10() { h(); } private static void h() { h2(); } private static void h2() { try { m(); } catch (IOException e) { x(); } catch (IllegalArgumentException e) { x(); } } }
  public static class Q11 { public Q11() { h(); } private static void h() { try { m(); } catch (IOException | IllegalStateException e) { x(); } } }
  public static class Q12 { public Q12() { h(); } private static void h() { try { m(); } catch (Exception e) { x(); } finally { x(); } } }
  public static class Q13 { public Q13() { h(); } private static void h() { try { x(); } catch (RuntimeException e) { x(); } try { m(); } catch (IOException e) { x(); } } }
  public static class Q14 { public Q14() { h(); } private static void h() { try { m(); } catch (IOException e) { x(); } try { x(); } catch (RuntimeException e) { x(); } } }
  public static class Q15 { public Q15() { h(); } private static void h() { try { x(); } finally { x(); } try { m(); } catch (IOException e) { x(); } } }
}
