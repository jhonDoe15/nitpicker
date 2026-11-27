package ivq;
import com.google.errorprone.annotations.InlineMe;
import ivq.other.Lib;
import ivq.other.Lib.In;
import java.util.*;

public class M<T> {
  public static int ss(){return 1;}
  public static int SF = 1;
  public int f;
  public M(int a){}
  public M(String a, int b){}
  @InlineMe(replacement="x") public M(){ this(1); }
  @InlineMe(replacement="x") public M(char c){ this(Lib.sf()); }
  @InlineMe(replacement="x") public M(long c){ this(ss()); }
  @InlineMe(replacement="x") public M(short c){ this(SF); }
  @InlineMe(replacement="x") public M(byte c){ this(new Lib().inst()); }
  @InlineMe(replacement="x") public M(float c){ this("a", In.g()); }
  @InlineMe(replacement="x") public M(double c){ this(M.ss()); }
  @InlineMe(replacement="x") public M(boolean c){ this(Integer.valueOf(1)); }
  @InlineMe(replacement="x") public M(Object c){ this(((Object) c).hashCode()); }
  @InlineMe(replacement="x") public M(int a, int b){ this(a + b); }
  @InlineMe(replacement="x") public static <U> M<U> make(U u){ return new M<U>(1); }
  @InlineMe(replacement="x") public static <U> M<U> make2(){ return new M<>(1); }
  @InlineMe(replacement="x") public static M<String> make3(){ return new M<String>(1); }
  @InlineMe(replacement="x") public static M<Lib> make4(){ return new M<Lib>(1); }
  @InlineMe(replacement="x") public static M<In> make5(){ return new M<In>(1); }
  @InlineMe(replacement="x") public static M<Map.Entry<String,String>> make6(){ return new M<Map.Entry<String,String>>(1); }
  @InlineMe(replacement="x") public static M<Map.Entry<String,String>> make7(){ return new M<java.util.Map.Entry<String,String>>(1); }
  @InlineMe(replacement="x") public final int g1(){ return M.SF; }
  @InlineMe(replacement="x") public final int g2(){ return this.SF; }
  @InlineMe(replacement="x") public final int g3(){ return SF; }
  @InlineMe(replacement="x") public final int g4(){ return ss() + SF; }
  @InlineMe(replacement="x") public final int g5(M<T> o){ return o.f + o.SF; }
  @InlineMe(replacement="x") public final Object g6(){ return new M<T>(1).f; }
  @InlineMe(replacement="x") public final Object g7(){ return M.<String>make(null); }
  @InlineMe(replacement="x") public final Object g8(){ return make(null); }
  @InlineMe(replacement="x") public final Object g9(){ return M.make(null); }
  @InlineMe(replacement="x") public final Object g10(){ return M.this.f; }
  @InlineMe(replacement="x") public final Object g11(){ return super.hashCode(); }
  @InlineMe(replacement="x") public final Object g12(){ return M.super.hashCode(); }
  @InlineMe(replacement="x") public final Object g13(){ return java.util.Collections.emptyList().size(); }
  @InlineMe(replacement="x") public final Object g14(){ return ((M<T>) this).f; }
  @InlineMe(replacement="x") public final Object g15(){ return (this).f; }
  @InlineMe(replacement="x") public final Object g16(){ return (f); }
  @InlineMe(replacement="x") public final Object g17(){ return (ss()); }
  @InlineMe(replacement="x") public final Object g18(){ return String.valueOf(f); }
  @InlineMe(replacement="x") public final Object g19(){ return f + ss(); }
  @InlineMe(replacement="x") public final Object g20(){ return Objects.hash(f, SF); }
}
