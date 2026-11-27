package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class J {
  public record R(int a, String b) {
    public R { }
    @InlineMe(replacement="x") public int a1(){ return a; }
    @InlineMe(replacement="x") public Object a2(){ return new R(1, "a"); }
    @InlineMe(replacement="x") public int a3(){ return a(); }
    @InlineMe(replacement="x") public int a4(){ return this.a; }
  }
  public record R2(int a) {
    @InlineMe(replacement="x") public Object a2(){ return new R2(1); }
    @InlineMe(replacement="x") public Object a3(){ return new J.R2(1); }
    public R2(String s) { this(1); }
    @InlineMe(replacement="x") public R2(char c) { this(2); }
  }
  record R3(int a) {
    @InlineMe(replacement="x") public Object a2(){ return new R3(1); }
  }
  public static class Cls {
    @InlineMe(replacement="x") public Object a2(){ return new Priv(); }
    @InlineMe(replacement="x") public Object a3(){ return new Pub(); }
    private static class Priv { }
    public static class Pub { }
    static class Pk { public Pk(){} }
    @InlineMe(replacement="x") public Object a4(){ return new Pk(); }
    public static class Dflt { }
    @InlineMe(replacement="x") public Object a5(){ return new Dflt(); }
    protected static class Prot { public Prot(){} }
    @InlineMe(replacement="x") public Object a6(){ return new Prot(); }
    private static class Priv2 { public Priv2(){} public static int s(){return 1;} }
    @InlineMe(replacement="x") public Object a7(){ return Priv2.s(); }
    @InlineMe(replacement="x") public Object a8(){ return new Priv2(); }
  }
  public enum En { A; En(){} }
}
