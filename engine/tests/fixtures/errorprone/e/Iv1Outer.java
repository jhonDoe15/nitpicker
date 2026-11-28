package iv1;
import static java.util.Objects.requireNonNull;
import com.google.errorprone.annotations.InlineMe;
import java.util.List;
import java.util.Map;
public class Iv1Outer {
  public void outerMethod() {}
  public final class Inner {
    @InlineMe(replacement = "outerMethod()")
    public void call() { outerMethod(); }
    @InlineMe(replacement = "requireNonNull(o)", staticImports = "java.util.Objects.requireNonNull")
    public Object check(Object o) { return requireNonNull(o); }
  }
  @InlineMe(replacement = "x.stream().map((s) -> s.length()).count()")
  public final long count(List<String> x) { return x.stream().map(s -> s.length()).count(); }
  @InlineMe(replacement = "x.stream().map((String s, String t) -> s).count()")
  public final long explicit(List<String> x) { return x.stream().reduce((String s, String t) -> s).hashCode(); }
  @InlineMe(replacement = "(Map.Entry<String, String>) o")
  public final Map.Entry<String, String> entry(Object o) { return (Map.Entry<String, String>) o; }
  @InlineMe(replacement = "java.util.Collections.<String>emptyList()")
  public final List<String> empty() { return java.util.Collections.<String>emptyList(); }
  @InlineMe(replacement = "new int[n]")
  public final int[] arr(int n) { return new int[n]; }
  @InlineMe(replacement = "x::add")
  public final java.util.function.Consumer<String> ref(List<String> x) { return x::add; }
  @InlineMe(replacement = "String.valueOf(\"{\")")
  public final String brace() { return String.valueOf("{"); }
  @InlineMe(replacement = "(a ? 1 : 2)")
  public final int tern(boolean a) { return (a ? 1 : 2); }
  @InlineMe(replacement = "a ? 1 : 2")
  public final int tern2(boolean a) { return a ? 1 : 2; }
}
