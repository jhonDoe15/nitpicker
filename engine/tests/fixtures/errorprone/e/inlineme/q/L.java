package ivq;
import com.google.errorprone.annotations.InlineMe;
import ivq.other.Lib;
import ivq.other.Lib.In;
import java.util.*;
import java.util.function.*;

public class L {
  public int f;
  public interface VA { int m(int... a); }
  public interface SA { int m(String[] a); }
  @InlineMe(replacement="x") public final VA v1(){ return (int... a) -> 1; }
  @InlineMe(replacement="x") public final VA v2(){ return (final int... a) -> 1; }
  @InlineMe(replacement="x") public final VA v3(){ return (@Deprecated int... a) -> 1; }
  @InlineMe(replacement="x") public final SA v4(){ return (String[] a) -> 1; }
  @InlineMe(replacement="x") public final Function<Lib,Integer> v5(){ return (Lib a) -> 1; }
  @InlineMe(replacement="x") public final Function<In,Integer> v6(){ return (In a) -> 1; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v7(){ return (final Integer a) -> 1; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v8(){ return (@Deprecated final Integer a) -> 1; }
  @InlineMe(replacement="x") public final Function<Map.Entry<String,String>,Integer> v9(){ return (Map.Entry<String,String> a) -> 1; }
  @InlineMe(replacement="x") public final Function<List<? extends Number>,Integer> v10(){ return (List<? extends Number> a) -> 1; }
  @InlineMe(replacement="x") public final Function<int[],Integer> v11(){ return (int a[]) -> 1; }
  @InlineMe(replacement="x") public final BiFunction<Integer,Integer,Integer> v12(){ return (var a, var b) -> 1; }
  @InlineMe(replacement="x") public final BiFunction<Integer,Integer,Integer> v13(){ return (final var a, final var b) -> 1; }
  @InlineMe(replacement="x") public final Supplier<Integer> v14(){ return () -> f; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v15(){ return a -> f + a; }
  @InlineMe(replacement="x") public final Function<Integer,Function<Integer,Integer>> v16(){ return a -> b -> a + b; }
  @InlineMe(replacement="x") public final Function<Integer,Function<Integer,Integer>> v17(){ return (Integer a) -> (Integer b) -> a + b; }
  @InlineMe(replacement="x") public final Supplier<Lib> v18(){ return () -> new Lib(); }
  @InlineMe(replacement="x") public final Supplier<Object> v19(){ return () -> Lib.sf(); }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v20(){ return a -> { int b = a; return b; }; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v21(){ return (Integer a) -> { return a; }; }
  @InlineMe(replacement="x") public final Runnable v22(){ return () -> {}; }
  @InlineMe(replacement="x") public final Runnable v23(){ return () -> { if (f > 1) { f++; } else { f--; } }; }
  @InlineMe(replacement="x") public final Runnable v24(){ return () -> { for (int i = 0; i < 2; i++) f++; }; }
  @InlineMe(replacement="x") public final Runnable v25(){ return () -> { try { f++; } catch (RuntimeException e) { throw e; } }; }
  @InlineMe(replacement="x") public final Runnable v26(){ return () -> { synchronized (this) { f++; } }; }
  @InlineMe(replacement="x") public final Runnable v27(){ return () -> { while (true) { break; } }; }
  @InlineMe(replacement="x") public final Runnable v28(){ return () -> { switch (f) { case 1: break; default: f++; } }; }
  @InlineMe(replacement="x") public final Runnable v29(){ return () -> { do { f++; } while (f < 3); }; }
  @InlineMe(replacement="x") public final Runnable v30(){ return () -> { l: for (;;) { break l; } }; }
  @InlineMe(replacement="x") public final Runnable v31(){ return () -> { for (int x : new int[]{1}) f += x; }; }
  @InlineMe(replacement="x") public final Runnable v32(){ return () -> { assert f > 0 : "x"; }; }
  @InlineMe(replacement="x") public final Runnable v33(){ return () -> { Object o = new Object(){ }; }; }
  @InlineMe(replacement="x") public final Runnable v34(){ return () -> { class Loc {} }; }
  @InlineMe(replacement="x") public final Runnable v35(){ return () -> { var x = 1; final int y = 2, z = 3; int[] a = {1}, b[] = {{2}}; }; }
  @InlineMe(replacement="x") public final Runnable v36(){ return () -> { int x; x = 1; ; }; }
  @InlineMe(replacement="x") public final Supplier<Integer> v37(){ return () -> { throw new RuntimeException(); }; }
  @InlineMe(replacement="x") public final Supplier<Integer> v38(){ return () -> switch (f) { default -> 1; }; }
  @InlineMe(replacement="x") public final Supplier<Integer> v39(){ return () -> { return switch (f) { case 1 -> 2; default -> { yield 3; } }; }; }
}
