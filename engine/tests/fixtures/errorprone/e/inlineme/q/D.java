package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class D {
  @InlineMe(replacement="x") public static final Class<?> a1(){ return int.class; }
  @InlineMe(replacement="x") public static final Class<?> a2(){ return boolean.class; }
  @InlineMe(replacement="x") public static final Class<?> a3(){ return List.class; }
  @InlineMe(replacement="x") public static final Class<?> a4(){ return List[].class; }
  @InlineMe(replacement="x") public static final Class<?> a5(){ return java.util.List[].class; }
  @InlineMe(replacement="x") public static final Class<?> a6(){ return int[][].class; }
  @InlineMe(replacement="x") public static final Class<?> a7(){ return Void.class; }
  @InlineMe(replacement="x") public static final Class<?> a8(){ return Map.Entry[].class; }
  @InlineMe(replacement="x") public static final Class<?> a9(){ return D.class; }
  @InlineMe(replacement="x") public static final Class<?> a10(){ return D[].class; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v1(){ return (var a) -> a; }
  @InlineMe(replacement="x") public final BiFunction<Integer,Integer,Integer> v2(){ return (var a, var b) -> a; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v3(){ return (final var a) -> a; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v5(){ return (@Deprecated Integer a) -> a; }
  @InlineMe(replacement="x") public final Function<List<String>,Integer> v6(){ return (List<String> a) -> 1; }
  @InlineMe(replacement="x") public final Function<int[],Integer> v7(){ return (int[] a) -> 1; }
  @InlineMe(replacement="x") public final Function<int[],Integer> v8(){ return (final int... a) -> 1; }
  @InlineMe(replacement="x") public final BiFunction<List<String>,Map.Entry<String,String>,Integer> v9(){ return (java.util.List<String> a, Map.Entry<String,String> b) -> 1; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v10(){ return (a) -> (a); }
  @InlineMe(replacement="x") public final Supplier<Supplier<Integer>> v11(){ return () -> () -> 1; }
  @InlineMe(replacement="x") public final Object v12(){ return (Supplier<Integer>) () -> 1; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> v13(){ return (_a) -> _a; }
}
