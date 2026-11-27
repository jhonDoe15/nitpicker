package iv2;
import static java.lang.Integer.MAX_VALUE;
import com.google.errorprone.annotations.InlineMe;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import iv2.q.IvQ;
public final class Iv2Gen<T> {
  int x;
  @Deprecated int old;
  @InlineMe(replacement = "(T) o")
  public T cast(Object o) { return (T) o; }
  @InlineMe(replacement = "(U) o")
  public <U> U cast2(Object o) { return (U) o; }
  @InlineMe(replacement = "MAX_VALUE + y")
  public int max(int y) { return MAX_VALUE + y; }
  @InlineMe(replacement = "new Inner()")
  public Inner inner() { return new Inner(); }
  @InlineMe(replacement = "new Builder<>()")
  public Builder<String> builder() { return new Builder<>(); }
  @InlineMe(replacement = "x")
  public int getX() { return x; }
  @InlineMe(replacement = "old")
  public int getOld() { return old; }
  @InlineMe(replacement = "IvQ::make")
  public java.util.function.Supplier<IvQ> ref() { return IvQ::make; }
  @InlineMe(replacement = "this.<String>id(s)")
  public String gen(String s) { return this.<String>id(s); }
  public <V> V id(V v) { return v; }
  @InlineMe(replacement = "a.length")
  public int len(int[] a) { return a.length; }
  @InlineMe(replacement = "f.apply((IvQ q) -> q)")
  public Object lam(Function<Function<IvQ, IvQ>, Object> f) { return f.apply((IvQ q) -> q); }
  @InlineMe(replacement = "this.id(/* c */ s)")
  public String com(String s) { return id(/* hi */ s); }
  @InlineMe(replacement = "this.id(\"é\\n\")")
  public String uni() { return id("é\n"); }
  @InlineMe(replacement = "Optional.of(a)")
  public Optional<String> opt(String a) { return Optional.of(a); }
  @InlineMe(replacement = "new ArrayList<IvQ>(n)")
  public List<IvQ> list(int n) { return new ArrayList<IvQ>(n); }
  @InlineMe(replacement = "new IvQ[n]")
  public IvQ[] arr(int n) { return new IvQ[n]; }
  @InlineMe(replacement = "IvQ.CONST")
  public int cst() { return IvQ.CONST; }
  @InlineMe(replacement = "new IvQ().dep()")
  public int depc() { return new IvQ().dep(); }
  @InlineMe(replacement = "new IvQ(1)")
  public IvQ depctor() { return new IvQ(1); }
  public class Inner {}
  public static class Builder<B> {}
}
