package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class C {
  public int f = 1;
  public int g(){return 1;}
  public static int sg(){return 1;}
  public class Inner {
    @InlineMe(replacement="x") public final int i1(){ return f; }
    @InlineMe(replacement="x") public final int i2(){ return g(); }
    @InlineMe(replacement="x") public final int i3(){ return C.this.f; }
    @InlineMe(replacement="x") public final int i4(){ return C.this.g(); }
    @InlineMe(replacement="x") public final int i5(){ return sg(); }
    @InlineMe(replacement="x") public final int i6(){ return this.hashCode(); }
    @InlineMe(replacement="x") public final Object i7(){ return new Inner(); }
    @InlineMe(replacement="x") public final Object i8(){ return C.this; }
    @InlineMe(replacement="x") public final Object i9(){ return new Object(){ public int h(){ return f; } }; }
    @InlineMe(replacement="x") public final Object i10(){ return new Object(){ public String toString(){ return "a"; } }; }
  }
  public static class SInner { public final int fld = 1;
    @InlineMe(replacement="x") public final int s1(){ return fld; }
    @InlineMe(replacement="x") public final int s2(){ return sg(); }
    @InlineMe(replacement="x") public final Object s3(){ return new C().new Inner(); }
  }
  @InlineMe(replacement="x") public final boolean p1(Object o){ return o instanceof String; }
  @InlineMe(replacement="x") public final boolean p2(Object o){ return o instanceof String s && s.isEmpty(); }
  @InlineMe(replacement="x") public final int p3(Object o){ return switch (o) { default -> 1; }; }
  @InlineMe(replacement="x") public final int p4(int a){ return ((a)); }
  @InlineMe(replacement="x") public final int p5(int a, int b){ return (a + b) * 2; }
  @InlineMe(replacement="x") public final int p6(int a, int b){ return a + (b * 2); }
  @InlineMe(replacement="x") public final int p7(int a, int b){ return a - (b - 2); }
  @InlineMe(replacement="x") public final int p8(int a){ return -(-a); }
  @InlineMe(replacement="x") public final int p9(int a){ return - -a; }
  @InlineMe(replacement="x") public final int p10(int a){ return ~a; }
  @InlineMe(replacement="x") public final boolean p11(boolean a){ return !a; }
  @InlineMe(replacement="x") public final int p12(int a){ return a << 2 >> 1 >>> 3; }
  @InlineMe(replacement="x") public final boolean p13(int a){ return a > 1 && a < 5 || a == 3; }
  @InlineMe(replacement="x") public final int p14(int[] a){ return a[0]; }
  @InlineMe(replacement="x") public final int p15(int[] a){ return a.length; }
  @InlineMe(replacement="x") public final int p16(int[][] a){ return a[0][1]; }
  @InlineMe(replacement="x") public final Object p17(Object a){ return a == null ? null : a; }
  @InlineMe(replacement="x") public final int p18(int a){ return a++; }
  @InlineMe(replacement="x") public final int p19(int a){ return ++a; }
  @InlineMe(replacement="x") public final int p20(int a){ return a = 1; }
  @InlineMe(replacement="x") public final int p21(int a){ return a += 1; }
  @InlineMe(replacement="x") public final Object p22(){ return List.of(1, 2); }
  @InlineMe(replacement="x") public final Object p23(){ return java.util.List.of(1, 2); }
  @InlineMe(replacement="x") public final Object p24(){ return Optional.<String>empty().map(s -> s); }
  @InlineMe(replacement="x") public final String p25(){ return String.valueOf((Object) null); }
  @InlineMe(replacement="x") public final String p26(){ return new String(new char[]{'a'}); }
  @InlineMe(replacement="x") public final void p27(){ System.out.println(); }
  @InlineMe(replacement="x") public final long p28(){ return System.currentTimeMillis(); }
  @InlineMe(replacement="x") public final Object p29(){ return java.util.Map.Entry.comparingByKey(); }
  @InlineMe(replacement="x") public final Object p30(){ return Map.Entry.comparingByKey(); }
}
