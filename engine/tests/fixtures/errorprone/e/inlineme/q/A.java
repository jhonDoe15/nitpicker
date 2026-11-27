package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class A {
  public static class Nested { public static int sf(int x){return x;} public static final int K = 1; public Nested(){} public <T> Nested(T t){} public int inst(){return 1;} public static class Deep { public static int d(){return 1;} public Deep(){} } }
  public interface Iface { int IK = 3; static int is(){return 1;} }
  public static class Base { public static int bs(){return 1;} public int bi(){return 1;} public static int BF = 2; public int field = 1; }
  public static class Sub extends Base implements Iface {
    @InlineMe(replacement="x") public final int t1(){ return bs(); }
    @InlineMe(replacement="x") public final int t2(){ return bi(); }
    @InlineMe(replacement="x") public final int t3(){ return IK; }
    @InlineMe(replacement="x") public final int t4(){ return is2(); }
    public static int is2(){return 1;}
    @InlineMe(replacement="x") public final int t5(){ return BF; }
    @InlineMe(replacement="x") public final int t6(){ return field; }
    @InlineMe(replacement="x") public final int t7(){ return this.field; }
    @InlineMe(replacement="x") public final int t8(){ return super.bi(); }
    @InlineMe(replacement="x") public final int t9(){ return Sub.bs(); }
    @InlineMe(replacement="x") public final int t10(){ return Base.bs(); }
    @InlineMe(replacement="x") public final int t11(){ return A.Nested.sf(1); }
    @InlineMe(replacement="x") public final int t12(){ return Nested.sf(1); }
    @InlineMe(replacement="x") public final int t13(){ return Nested.Deep.d(); }
    @InlineMe(replacement="x") public final Object t14(){ return new Nested.Deep(); }
    @InlineMe(replacement="x") public final Object t15(){ return new A.Nested.Deep(); }
    @InlineMe(replacement="x") public final Object t16(){ return new <String>Nested("a"); }
    @InlineMe(replacement="x") public final Object t17(){ return new Nested("a"); }
    @InlineMe(replacement="x") public final int t18(){ return Nested.K; }
    @InlineMe(replacement="x") public final int t19(){ return A.Nested.K; }
    @InlineMe(replacement="x") public final int t20(){ return Iface.IK; }
    @InlineMe(replacement="x") public final int t21(){ return Iface.is(); }
    @InlineMe(replacement="x") public final int t22(){ return new Nested().inst(); }
  }
  public enum E { ONE, TWO; public static E of(){return ONE;} }
  @InlineMe(replacement="x") public static final E e1(){ return E.ONE; }
  @InlineMe(replacement="x") public static final E e2(){ return A.E.TWO; }
  @InlineMe(replacement="x") public static final E e3(){ return E.of(); }
  @InlineMe(replacement="x") public static final List<String> e4(){ return Collections.<String>emptyList(); }
  @InlineMe(replacement="x") public static final List<String> e5(){ return new ArrayList<>(); }
  @InlineMe(replacement="x") public static final List<String> e6(){ return new ArrayList<String>(5); }
  @InlineMe(replacement="x") public static final int[] e7(){ return new int[3]; }
  @InlineMe(replacement="x") public static final int[][] e8(){ return new int[3][]; }
  @InlineMe(replacement="x") public static final int[] e9(){ return new int[]{1,2}; }
  @InlineMe(replacement="x") public static final String[] e10(){ return new String[]{"a"}; }
  @InlineMe(replacement="x") public static final Class<?> e11(){ return String.class; }
  @InlineMe(replacement="x") public static final Class<?> e12(){ return int[].class; }
  @InlineMe(replacement="x") public static final Class<?> e13(){ return A.Nested.class; }
  @InlineMe(replacement="x") public static final Class<?> e14(){ return void.class; }
  @InlineMe(replacement="x") public static final Class<?> e15(){ return java.util.Map.Entry.class; }
}
