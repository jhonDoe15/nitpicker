package iv3;
import com.google.errorprone.annotations.InlineMe;
import java.util.List;
import java.util.Map;
public final class Iv3Print {
  @InlineMe(replacement = "x")
  public int a(int x) { return x + 0x10 + 1_000 + 07; }
  @InlineMe(replacement = "x")
  public String b(String x) { return x + "a" + "b" + 'c' + '\n'; }
  @InlineMe(replacement = "x")
  public boolean c(Object x) { return x instanceof List<?> && !(x instanceof Map); }
  @InlineMe(replacement = "x")
  public long d(long x) { return -x * (x - 1L) >>> 2; }
  @InlineMe(replacement = "x")
  public Class<?> e(Object x) { return int[].class; }
  @InlineMe(replacement = "x")
  public double f(double x) { return x * 1.5e10 + 2.0f + .5; }
  @InlineMe(replacement = "x")
  public Object g(List<? extends Number> x) { return (List<? super Integer>) (Object) x; }
  @InlineMe(replacement = "x")
  public Object h(Object x) { return x == null ? null : x; }
  @InlineMe(replacement = "x")
  public Object i(int[] x) { return x[0]++; }
  @InlineMe(replacement = "x")
  public Object j(Runnable x) { return (Runnable & java.io.Serializable) () -> {}; }
  @InlineMe(replacement = "x")
  public Object k(String x) { return x.chars().mapToObj((int c) -> (char) c).map(Character::toUpperCase); }
  @InlineMe(replacement = "x")
  public Object l(String x) { return x.chars().mapToObj((c) -> c).reduce((p, q) -> p); }
  @InlineMe(replacement = "x")
  public Object m(String x) { return "\t\u0000é\\\"'"; }
  @InlineMe(replacement = "x")
  public Object n(long x) { return 9223372036854775807L + Long.MIN_VALUE; }
  @InlineMe(replacement = "x")
  public Object o(int x) { return -2147483648; }
}
