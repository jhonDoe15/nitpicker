package ivra;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;

public class RaF implements RaFI {
  public enum Color { RED, @Deprecated OLD }
  @Deprecated public static class OldC { public static int sm() { return 1; } }
  @InlineMe(replacement = "x") @Deprecated public int q1() { return RaFI.super.dm(); }
  @InlineMe(replacement = "x") @Deprecated public int q2() { return RaF.super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated int q3() { return RaF.super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated int q4() { return RaFI.super.dm(); }
  @InlineMe(replacement = "x") @Deprecated int q5() { return RaF.this.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public int q6() { return Color.OLD.ordinal(); }
  @InlineMe(replacement = "x") @Deprecated public int q7() { return Color.RED.ordinal(); }
  @InlineMe(replacement = "x") @Deprecated public int q8() { return OldC.sm(); }
  @InlineMe(replacement = "x") @Deprecated public Object q9(Object o) { return (OldC) o; }
  @InlineMe(replacement = "x") @Deprecated public Object q10(int[] o) { return o.clone(); }
  @InlineMe(replacement = "x") @Deprecated public Object q11(int[][] o) { return o[0].clone(); }
  @InlineMe(replacement = "x") @Deprecated public Object q12(String... o) { return new Object() { Object z = o; }; }
  @InlineMe(replacement = "x") @Deprecated public Object q13(String... o) { return new Object() { int z = o.length; }; }
  @InlineMe(replacement = "x") @Deprecated public Object q14(String... o) { return new Object() { Object z = Arrays.asList(o); }; }
  @InlineMe(replacement = "x") @Deprecated public Object q15(String... o) { return new Object() { }; }
  @InlineMe(replacement = "x") @Deprecated public Object q16(String... o) { return new ArrayList<String>(Arrays.asList(o)) { }; }
}
