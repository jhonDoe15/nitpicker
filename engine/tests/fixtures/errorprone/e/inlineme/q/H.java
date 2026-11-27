package ivq;
import com.google.errorprone.annotations.InlineMe;
import static ivq.other.Lib.sf;
import static ivq.other.Lib.K;
import ivq.other.Lib;
import ivq.other.Lib.In;
import ivq.other.Lib.Gen;
import java.util.*;
import java.util.function.*;

public class H<T> extends Lib {
  public Lib fieldLib;
  public static int ssf(){return 1;}
  public static final Lib SLIB = null;
  public H(){}
  @InlineMe(replacement="x") public final int a1(){ return sf(); }
  @InlineMe(replacement="x") public final int a2(){ return K; }
  @InlineMe(replacement="x") public final int a3(){ return In.g(); }
  @InlineMe(replacement="x") public final int a4(){ return Lib.In.g(); }
  @InlineMe(replacement="x") public final int a5(){ return ivq.other.Lib.sf(); }
  @InlineMe(replacement="x") public final int a6(){ return ivq.other.Lib.In.g(); }
  @InlineMe(replacement="x") public final Object a7(){ return new Lib.Gen<String>(); }
  @InlineMe(replacement="x") public final Object a8(){ return new Gen<>(); }
  @InlineMe(replacement="x") public final Object a9(){ return Lib.Gen.<String>make(); }
  @InlineMe(replacement="x") public final Object a10(){ return Gen.make(); }
  @InlineMe(replacement="x") public final Object a11(){ return new Lib(); }
  @InlineMe(replacement="x") public final Object a12(Object o){ return (Lib) o; }
  @InlineMe(replacement="x") public final Object a13(Object o){ return (In) o; }
  @InlineMe(replacement="x") public final Object a14(Object o){ return (T) o; }
  @InlineMe(replacement="x") public final Object a15(){ return new ArrayList<T>(); }
  @InlineMe(replacement="x") public final Object a16(){ return new ArrayList<In>(); }
  @InlineMe(replacement="x") public final Object a17(){ return new ArrayList<Lib>(); }
  @InlineMe(replacement="x") public final Object a18(){ return new In[1]; }
  @InlineMe(replacement="x") public final Object a19(){ return new Lib[1]; }
  @InlineMe(replacement="x") public final Object a21(){ return (Supplier<Integer>) Lib::sf; }
  @InlineMe(replacement="x") public final Object a22(){ return (Supplier<Integer>) In::g; }
  @InlineMe(replacement="x") public final Object a23(){ return (Supplier<Integer>) H::ssf; }
  @InlineMe(replacement="x") public final Object a24(){ return fieldLib.inst(); }
  @InlineMe(replacement="x") public final Object a25(){ return SLIB.inst(); }
  @InlineMe(replacement="x") public final int a26(){ return ssf(); }
  @InlineMe(replacement="x") public final Object a27(){ return inst(); }
  @InlineMe(replacement="x") public final Object a28(){ return this.inst(); }
  public static <U> int ssf2(){return 1;}
  @InlineMe(replacement="x") public final Object a30(){ return new H<String>(); }
  @InlineMe(replacement="x") public final Object a31(){ return new H<>(); }
  @InlineMe(replacement="x") public final Object a32(){ return (H<T>) this; }
  @InlineMe(replacement="x") public final Object a33(){ return this; }
  @InlineMe(replacement="x") public final Object a34(){ return H.this; }
  @InlineMe(replacement="x") public final Object a36(){ return Optional.of(1).map(String::valueOf); }
  @InlineMe(replacement="x") public final Object a37(){ return Optional.of(1).map(Objects::toString); }
  @InlineMe(replacement="x") public final Object a38(){ return Integer.MAX_VALUE; }
  @InlineMe(replacement="x") public final Object a39(){ return java.lang.Integer.MAX_VALUE; }
  @InlineMe(replacement="x") public final Object a40(){ return Map.Entry.class; }
  @InlineMe(replacement="x") public final Object a41(){ return new HashMap<String, Map.Entry<String,List<T>>>(); }
  @InlineMe(replacement="x") public final Object a44(){ return (List<? super In>) null; }
  @InlineMe(replacement="x") public final Object a45(){ return Collections.<In>emptyList(); }
  @InlineMe(replacement="x") public final Object a46(){ return Collections.<Lib>emptyList(); }
  @InlineMe(replacement="x") public final Object a47(){ return new Object[]{ sf(), K }; }
  @InlineMe(replacement="x") public final Object a48(){ return new int[][]{{1},{2}}; }
  @InlineMe(replacement="x") public final Object a49(){ return new Lib[]{ null }; }
  @InlineMe(replacement="x") public final Object a50(){ return new Lib[1][2]; }
  @InlineMe(replacement="x") public final Object a51(){ return new In[]{}; }
  @InlineMe(replacement="x") public final Object a52(Object o){ return o instanceof Lib; }
  @InlineMe(replacement="x") public final Object a53(Object o){ return o instanceof In i && i != null; }
  @InlineMe(replacement="x") public final Object a54(Object o){ return o instanceof List<?> l ? 1 : 2; }
  @InlineMe(replacement="x") public final Object a55(Object o){ return o instanceof Lib l && l.inst() > 0; }
  @InlineMe(replacement="x") public final int a56(int o){ return switch (o) { case 1 -> 2; default -> 3; }; }
  @InlineMe(replacement="x") public final Object a57(){ return new Lib() {}; }
  @InlineMe(replacement="x") public final Object a58(){ return new Object(){}; }
  @InlineMe(replacement="x") public final Object a59(){ return (Lib & java.io.Serializable) null; }
}
