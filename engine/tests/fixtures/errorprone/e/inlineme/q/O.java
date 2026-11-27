package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;

public class O {
  public static int ss(){return 1;}
  public int f;
  public static Object anon = new Object() {
    public int g;
    public static int sx(){return 1;}
    @InlineMe(replacement="x") public final int a1(){ return g; }
    @InlineMe(replacement="x") public final int a2(){ return ss(); }
    @InlineMe(replacement="x") public final int a3(){ return sx(); }
    @InlineMe(replacement="x") public final int a4(){ return this.g; }
    @InlineMe(replacement="x") public final Object a5(){ return new Object(); }
    @InlineMe(replacement="x") public final int a6(){ return f2(); }
    public int f2(){return 1;}
  };
  public void run() {
    class Loc {
      public int g;
      public static int sx(){return 1;}
      @InlineMe(replacement="x") public final int a1(){ return g; }
      @InlineMe(replacement="x") public final int a2(){ return ss(); }
      @InlineMe(replacement="x") public final int a3(){ return sx(); }
      @InlineMe(replacement="x") public final Object a4(){ return new Loc(); }
      @InlineMe(replacement="x") public final Object a5(){ return Loc.sx(); }
      @InlineMe(replacement="x") public final Object a6(){ return f; }
    }
  }
  public enum En {
    A { @InlineMe(replacement="x") public final int a1(){ return hashCode(); } },
    B;
    public static int es(){ return 1; }
    @InlineMe(replacement="x") public final int a2(){ return es(); }
  }
  public static class Gen<T> {
    public static class In2<U> {
      public static int s2(){return 1;}
      public U u;
      @InlineMe(replacement="x") public final Object a1(){ return s2(); }
      @InlineMe(replacement="x") public final Object a2(){ return u; }
      @InlineMe(replacement="x") public final Object a3(){ return new In2<U>(); }
      @InlineMe(replacement="x") public final Object a4(){ return new In2<>(); }
      @InlineMe(replacement="x") public final Object a5(){ return In2.s2(); }
      @InlineMe(replacement="x") public final Object a6(){ return Gen.In2.s2(); }
      @InlineMe(replacement="x") public final Object a7(){ return O.Gen.In2.s2(); }
      @InlineMe(replacement="x") public final Object a8(){ return O.ss(); }
      @InlineMe(replacement="x") public final Object a9(){ return ss(); }
    }
  }
}
