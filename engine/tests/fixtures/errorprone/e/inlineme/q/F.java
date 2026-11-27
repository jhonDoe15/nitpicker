package ivq;
import com.google.errorprone.annotations.InlineMe;
import ivq.other.Lib;
import java.util.*;
import java.util.function.*;

public class F {
  static final String R = "Lib.sf()";
  static final String I = "ivq.other.Lib";
  @InlineMe(replacement="Lib.sf()", imports="ivq.other.Lib") public final int a1(){ return Lib.sf(); }
  @InlineMe(replacement="Lib" + ".sf()", imports={"ivq.other.Lib"}) public final int a2(){ return Lib.sf(); }
  @InlineMe(replacement=R, imports=I) public final int a3(){ return Lib.sf(); }
  @InlineMe(replacement=R, imports={I, I}) public final int a4(){ return Lib.sf(); }
  @InlineMe(replacement=R, imports={}) public final int a5(){ return Lib.sf(); }
  @InlineMe(replacement=R, imports={"ivq.other.Lib", "ivq.other.Lib"}) public final int a6(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf()") public final int a7(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf()", imports={"ivq.other.Lib", "ivq.other.Lib.In"}) public final int a8(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.In.g() + Lib.sf()", imports={"ivq.other.Lib"}) public final int a9(){ return Lib.In.g() + Lib.sf(); }
  @ivq.other.InlineMe(replacement="x") public final int b1(){ return Lib.sf(); }
  @ivq.other.InlineMe(replacement="x", imports="y") public final int b2(){ return Lib.sf(); }
  @ivq.other.InlineMe(replacement="Lib.sf()") public final int b3(){ return Lib.sf(); }
  @com.google.errorprone.annotations.InlineMe(replacement="x") public final int b4(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf( )") public final int b5(){ return Lib.sf(); }
  @InlineMe(replacement="Lib . sf ( ) /* c */", imports="ivq.other.Lib") public final int b6(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf() // c\n", imports="ivq.other.Lib") public final int b7(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf();", imports="ivq.other.Lib") public final int b8(){ return Lib.sf(); }
  @InlineMe(replacement="return Lib.sf()", imports="ivq.other.Lib") public final int b9(){ return Lib.sf(); }
  @InlineMe(replacement="  Lib.sf()  ", imports="ivq.other.Lib") public final int b10(){ return Lib.sf(); }
  @InlineMe(replacement="Lib.sf", imports="ivq.other.Lib") public final int b11(){ return Lib.sf(); }
  @InlineMe(replacement="ivq.other.Lib.sf()", imports="ivq.other.Lib") public final int b12(){ return Lib.sf(); }
  @InlineMe(replacement="1+2") public final int c1(){ return 1 + 2; }
  @InlineMe(replacement="1 + 2") public final int c2(){ return 1+2; }
  @InlineMe(replacement="0x10") public final int c3(){ return 16; }
  @InlineMe(replacement="16") public final int c4(){ return 0x10; }
  @InlineMe(replacement="1_0") public final int c5(){ return 10; }
  @InlineMe(replacement="10") public final int c6(){ return 1_0; }
  @InlineMe(replacement="1L") public final long c7(){ return 1l; }
  @InlineMe(replacement="1") public final long c8(){ return 1L; }
  @InlineMe(replacement="1.0") public final double c9(){ return 1d; }
  @InlineMe(replacement="1.0f") public final float c10(){ return 1F; }
  @InlineMe(replacement="1.0F") public final float c11(){ return 1.0f; }
  @InlineMe(replacement="1.0") public final double c12(){ return 1.00; }
  @InlineMe(replacement="1e1") public final double c13(){ return 1E1; }
  @InlineMe(replacement="'a'") public final char c14(){ return '\u0061'; }
  @InlineMe(replacement="\"a\"") public final String c15(){ return "\u0061"; }
  @InlineMe(replacement="\"\\u0061\"") public final String c16(){ return "a"; }
  @InlineMe(replacement="\"a\\tb\"") public final String c17(){ return "a\tb"; }
  @InlineMe(replacement="\"a\tb\"") public final String c18(){ return "a\tb"; }
  @InlineMe(replacement="\"\\101\"") public final String c19(){ return "A"; }
  @InlineMe(replacement="\"\"\"\n  a\n  \"\"\"") public final String c20(){ return "a\n"; }
  @InlineMe(replacement="\"a\"") public final String c21(){ return """
     a"""; }
  @InlineMe(replacement="\"\"\"\n    a\n  \"\"\"") public final String c22(){ return """
      a
    """; }
  @InlineMe(replacement="a>>b") public final int c23(int a, int b){ return a>>b; }
  @InlineMe(replacement="List.of(List.of(a))", imports="java.util.List") public final Object c24(int a){ return List.of(List.of(a)); }
  @InlineMe(replacement="new ArrayList<List<String>>()", imports={"java.util.ArrayList","java.util.List"}) public final Object c25(){ return new ArrayList<List<String>>(); }
  @InlineMe(replacement="new ArrayList<List<String>>()", imports={"java.util.ArrayList","java.util.List"}) public final Object c26(){ return new ArrayList<List<String>>(); }
  @InlineMe(replacement="a ? b : c") public final int c27(boolean a, int b, int c){ return a ? b : c; }
  @InlineMe(replacement="@") public final int c28(){ return 1; }
  @InlineMe(replacement="a\\b") public final int c29(){ return 1; }
  @InlineMe(replacement="1 .0") public final double c30(){ return 1.0; }
  @InlineMe(replacement="x$y") public final int c31(int x$y){ return x$y; }
  @InlineMe(replacement="a") public final int c32(int a){ return a; }
  @InlineMe(replacement="A") public final int c33(int a){ return a; }
  @InlineMe(replacement="1 ... 2") public final int c34(){ return 1; }
}
