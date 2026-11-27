package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class K {
  public class In { public In(){} public int m(){return 1;} }
  public <U> U gen(U u){ return u; }
  public int f; public int[] arr; public K next;
  public static int s(int... a){return 1;}
  @InlineMe(replacement="x") public final Object a1(int a, int b){ return a - -b; }
  @InlineMe(replacement="x") public final Object a2(int a, int b){ return a + +b; }
  @InlineMe(replacement="x") public final Object a3(int a){ return - -a; }
  @InlineMe(replacement="x") public final Object a4(int a){ return -(-1); }
  @InlineMe(replacement="x") public final Object a5(boolean a, boolean b){ return !(a && b); }
  @InlineMe(replacement="x") public final Object a6(boolean a, boolean b){ return !a && b; }
  @InlineMe(replacement="x") public final Object a7(){ return 'a' + 1; }
  @InlineMe(replacement="x") public final Object a8(){ return (int) (long) 1; }
  @InlineMe(replacement="x") public final Object a9(int a, int b){ return (a + b) * 3; }
  @InlineMe(replacement="x") public final Object a10(Object a){ return ((Object) a).toString(); }
  @InlineMe(replacement="x") public final Object a11(){ return new Object().toString(); }
  @InlineMe(replacement="x") public final Object a12(){ return new int[]{1}[0]; }
  @InlineMe(replacement="x") public final Object a13(){ return "a".length(); }
  @InlineMe(replacement="x") public final Object a14(){ return 1 + 2 * 3; }
  @InlineMe(replacement="x") public final Object a15(){ return (1 + 2) * 3; }
  @InlineMe(replacement="x") public final Object a16(){ return 1 + (2 + 3); }
  @InlineMe(replacement="x") public final Object a17(K k){ return k.new In(); }
  @InlineMe(replacement="x") public final Object a18(){ return this.new In(); }
  @InlineMe(replacement="x") public final Object a19(){ return new In(); }
  @InlineMe(replacement="x") public final Object a20(){ return K.this.new In(); }
  @InlineMe(replacement="x") public final Object a21(){ return this.<String>gen("a"); }
  @InlineMe(replacement="x") public final Object a22(){ return gen("a"); }
  @InlineMe(replacement="x") public final Object a23(){ return s(); }
  @InlineMe(replacement="x") public final Object a24(){ return s(1, 2); }
  @InlineMe(replacement="x") public final Object a25(){ return arr[0]; }
  @InlineMe(replacement="x") public final Object a26(){ return arr.length; }
  @InlineMe(replacement="x") public final Object a27(){ return next.next.f; }
  @InlineMe(replacement="x") public final Object a28(){ return next.f + this.f; }
  @InlineMe(replacement="x") public final Object a29(int a){ return a == 1 | a == 2 & a == 3 ^ a == 4; }
  @InlineMe(replacement="x") public final Object a30(int a, int b, int c){ return a - b - c; }
  @InlineMe(replacement="x") public final Object a31(int a, int b, int c){ return a - (b - c); }
  @InlineMe(replacement="x") public final Object a32(int a, int b, int c){ return a / b * c; }
  @InlineMe(replacement="x") public final Object a33(int a, int b, int c){ return a / (b * c); }
  @InlineMe(replacement="x") public final Object a34(String a, int b){ return a + b + 1; }
  @InlineMe(replacement="x") public final Object a35(String a, int b){ return a + (b + 1); }
  @InlineMe(replacement="x") public final Object a36(int a){ return a << 1 + 2; }
  @InlineMe(replacement="x") public final Object a37(int a){ return (a << 1) + 2; }
  @InlineMe(replacement="x") public final Object a38(Object a){ return (String) a + "x"; }
  @InlineMe(replacement="x") public final Object a39(Object a){ return ((String) a).length(); }
  @InlineMe(replacement="x") public final Object a40(int a){ return (byte) -a; }
  @InlineMe(replacement="x") public final Object a41(int a){ return (long) a * a; }
  @InlineMe(replacement="x") public final Object a42(int a){ return (long) (a * a); }
  @InlineMe(replacement="x") public final Object a43(Object a){ return a instanceof String && ((String) a).isEmpty(); }
  @InlineMe(replacement="x") public final Object a44(Object a){ return !(a instanceof String); }
  @InlineMe(replacement="x") public final Object a45(){ return new int[0].length; }
  @InlineMe(replacement="x") public final Object a46(){ return new ArrayList<>(Arrays.asList(1, 2)); }
  @InlineMe(replacement="x") public final Object a47(){ return new HashMap<String, List<Integer>>() ; }
  @InlineMe(replacement="x") public final Object a48(){ return (Object) (Object) null; }
  @InlineMe(replacement="x") public final Object a49(List<String> l){ return l.toArray(new String[0]); }
  @InlineMe(replacement="x") public final Object a50(List<String> l){ return l.toArray(String[]::new); }
  @InlineMe(replacement="x") public final Object a51(){ return 1L << 40; }
  @InlineMe(replacement="x") public final Object a52(){ return 1e-5; }
  @InlineMe(replacement="x") public final Object a53(){ return 123456789.0f; }
  @InlineMe(replacement="x") public final Object a54(){ return 1.0e100; }
  @InlineMe(replacement="x") public final Object a55(){ return Double.NaN; }
  @InlineMe(replacement="x") public final Object a56(){ return 0.1f + 0.1; }
  @InlineMe(replacement="x") public final Object a57(){ return 1e7; }
  @InlineMe(replacement="x") public final Object a58(){ return 100000000.0f; }
  @InlineMe(replacement="x") public final Object a59(){ return 0xFFFFFFFF; }
  @InlineMe(replacement="x") public final Object a60(){ return 0xFFFFFFFFFFFFFFFFL; }
  @InlineMe(replacement="x") public final Object a61(){ return 'é'; }
  @InlineMe(replacement="x") public final Object a62(){ return '\u0000'; }
  @InlineMe(replacement="x") public final Object a63(){ return "\u007f\u0080￿😀"; }
  @InlineMe(replacement="x") public final Object a64(){ return "\b\f\r\0\7\11"; }
  @InlineMe(replacement="x") public final Object a65(){ return "😀"; }
  @InlineMe(replacement="x") public final Object a66(){ return '\\'; }
  @InlineMe(replacement="x") public final Object a67(){ return "'"; }
  @InlineMe(replacement="x") public final Object a68(){ return ' '; }
  @InlineMe(replacement="x") public final Object a69(){ return " \u0085"; }
  @InlineMe(replacement="x") public final Object a70(){ return "a" + "b" + 1 + 2; }
  @InlineMe(replacement="x") public final Object a71(){ return 1 + 2 + "a"; }
  @InlineMe(replacement="x") public final Object a72(){ return -2147483648; }
  @InlineMe(replacement="x") public final Object a73(){ return -9223372036854775808L; }
  @InlineMe(replacement="x") public final Object a74(){ return 0; }
  @InlineMe(replacement="x") public final Object a75(){ return 00; }
  @InlineMe(replacement="x") public final Object a76(){ return 0L; }
  @InlineMe(replacement="x") public final Object a77(){ return 0.0f; }
  @InlineMe(replacement="x") public final Object a78(){ return 1__0; }
  @InlineMe(replacement="x") public final Object a79(){ return 1e1f; }
  @InlineMe(replacement="x") public final Object a80(){ return 0x1.8p1f; }
}
