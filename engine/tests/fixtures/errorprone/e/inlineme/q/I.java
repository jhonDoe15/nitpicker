package ivq;
import com.google.errorprone.annotations.InlineMe;
import ivq.other.Lib;
import java.util.*;

public interface I {
  int CONST = 1;
  static int ist(){ return 1; }
  @InlineMe(replacement="x") static int a1(){ return CONST; }
  @InlineMe(replacement="x") static int a2(){ return ist(); }
  @InlineMe(replacement="x") static int a3(){ return Lib.sf(); }
  @InlineMe(replacement="x") public static int a4(){ return I.ist() + I.CONST; }
  @InlineMe(replacement="x") public static int a5(){ return CONST; }
  @InlineMe(replacement="x") default int a6(){ return CONST; }
  enum En {
    X, Y;
    public static En def(){ return X; }
    @InlineMe(replacement="x") public final En a1(){ return X; }
    @InlineMe(replacement="x") public final En a2(){ return def(); }
    @InlineMe(replacement="x") public final En a3(){ return this; }
    @InlineMe(replacement="x") public final En a4(){ return En.Y; }
    @InlineMe(replacement="x") public final int a5(){ return ordinal(); }
    @InlineMe(replacement="x") public final Object a6(){ return values(); }
    @InlineMe(replacement="x") public final Object a7(){ return En.valueOf("X"); }
    @InlineMe(replacement="x") public final Object a8(){ return valueOf("X"); }
    @InlineMe(replacement="x") public final Object a9(){ return name().length(); }
  }
  record Rec(int a) {
    @InlineMe(replacement="x") public int a1(){ return a; }
    @InlineMe(replacement="x") public int a2(){ return a(); }
    @InlineMe(replacement="x") public Object a3(){ return new Rec(1); }
    @InlineMe(replacement="x") public Object a4(){ return this.a; }
    @InlineMe(replacement="x") public static Object a5(){ return new Rec(1); }
  }
}
