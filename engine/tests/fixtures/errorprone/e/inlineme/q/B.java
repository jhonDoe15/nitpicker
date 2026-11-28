package ivq;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class B {
  public static int sm(int x){return x;}
  public int im(int x){return x;}
  public B(){}
  public B(int x){}
  @InlineMe(replacement="x") public final Supplier<Integer> m1(){ return this::hashCode; }
  @InlineMe(replacement="x") public final Function<String,Integer> m2(){ return String::length; }
  @InlineMe(replacement="x") public final Supplier<List<String>> m3(){ return ArrayList::new; }
  @InlineMe(replacement="x") public final Function<Integer,int[]> m4(){ return int[]::new; }
  @InlineMe(replacement="x") public final Function<Integer,String[]> m5(){ return String[]::new; }
  @InlineMe(replacement="x") public final IntUnaryOperator m6(){ return B::sm; }
  @InlineMe(replacement="x") public final IntUnaryOperator m7(){ return this::im; }
  public int hashCode2(int x){return x;}
  @InlineMe(replacement="x") public final Supplier<B> m9(){ return B::new; }
  @InlineMe(replacement="x") public final Function<String,List<String>> m10(){ return Collections::<String>singletonList; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> l1(){ return (Integer a) -> a; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> l2(){ return a -> a; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> l3(){ return (a) -> a + 1; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> l4(){ return (var a) -> a; }
  @InlineMe(replacement="x") public final Function<Integer,Integer> l5(){ return (final Integer a) -> a; }
  @InlineMe(replacement="x") public final BiFunction<Integer,Integer,Integer> l6(){ return (a, b) -> a + b; }
  @InlineMe(replacement="x") public final BiFunction<Integer,Integer,Integer> l7(){ return (Integer a, Integer b) -> a + b; }
  @InlineMe(replacement="x") public final Supplier<Integer> l8(){ return () -> 1; }
  @InlineMe(replacement="x") public final Supplier<Integer> l9(){ return () -> { return 1; }; }
  @InlineMe(replacement="x") public final Runnable l10(){ return () -> { System.out.println(); }; }
  @InlineMe(replacement="x") public final Runnable l11(){ return () -> System.out.println(); }
  @InlineMe(replacement="x") public final Object c1(){ return (Runnable & java.io.Serializable) () -> {}; }
  @InlineMe(replacement="x") public final Object c2(){ return (Object) "a"; }
  @InlineMe(replacement="x") public final int c3(){ return (int) 1L; }
  @InlineMe(replacement="x") public final Object c4(){ return (List<String>) new ArrayList<String>(); }
  @InlineMe(replacement="x") public final Object c5(){ return (java.util.List<String> & java.io.Serializable) null; }
  @InlineMe(replacement="x") public final Object c6(){ return (int[]) null; }
  @InlineMe(replacement="x") public final String s1(){ return "a" + "b"; }
  @InlineMe(replacement="x") public final String s2(){ return "a" + 1 + 'c'; }
  @InlineMe(replacement="x") public final String s3(){ return "a\n\t\"q\"\\"; }
  @InlineMe(replacement="x") public final String s4(){ return "é中"; }
  @InlineMe(replacement="x") public final String s5(){ return """
      hello
        world
      """; }
  @InlineMe(replacement="x") public final String s6(){ return "\0\1\177\u0001"; }
  @InlineMe(replacement="x") public final char ch1(){ return '\''; }
  @InlineMe(replacement="x") public final char ch2(){ return '\n'; }
  @InlineMe(replacement="x") public final char ch3(){ return 'A'; }
  @InlineMe(replacement="x") public final char ch4(){ return '"'; }
  @InlineMe(replacement="x") public final Object n1(){ return 0x10; }
  @InlineMe(replacement="x") public final Object n2(){ return 1_000L; }
  @InlineMe(replacement="x") public final Object n3(){ return 1.0f; }
  @InlineMe(replacement="x") public final Object n4(){ return 1e10; }
  @InlineMe(replacement="x") public final Object n5(){ return 0b101; }
  @InlineMe(replacement="x") public final Object n6(){ return 017; }
  @InlineMe(replacement="x") public final Object n7(){ return -1; }
  @InlineMe(replacement="x") public final Object n8(){ return 1.5D; }
  @InlineMe(replacement="x") public final Object n9(){ return 0x1.0p3; }
  @InlineMe(replacement="x") public final Object n10(){ return Integer.MIN_VALUE; }
  @InlineMe(replacement="x") public final Object n11(){ return 2147483648L; }
  @InlineMe(replacement="x") public final Object n12(){ return .5; }
  @InlineMe(replacement="x") public final Object n13(){ return 1.; }
}
