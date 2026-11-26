package e;

import com.google.errorprone.annotations.NoAllocation;
import java.util.Arrays;

class S25NoAllocation {

            static class Pos {
              // Trigger on new array.
              @NoAllocation
              public int[] newArray(int size) {
                return new int[size];
              }

              @NoAllocation
              public int[] arrayInitializer(int a, int b) {
                int[] array = {a, b};
                return array;
              }

              @NoAllocation
              public int[] returnArrayInitializer(int a, int b) {
                return new int[] {a, b};
              }

              // Trigger on new.
              @NoAllocation
              public String newString(String s) {
                return new String(s);
              }

              // Trigger calling a method that does allocation.
              public String allocateString() {
                return new String();
              }

              @NoAllocation
              public String getString() {
                return allocateString();
              }

              // Trigger on string conversion.
              @NoAllocation
              public int getInt() {
                return 1;
              }

              @NoAllocation
              public String stringConvReturn(int i) {
                return "" + i;
              }

              @NoAllocation
              public String stringConvAssign(int i) {
                String s = "" + i;
                return s;
              }

              @NoAllocation
              public String stringConvAssign2(int i) {
                String s = "";
                s = s + i;
                return s;
              }

              @NoAllocation
              public String stringConvAssign3(int i) {
                String s = "";
                s = i + s;
                return s;
              }

              @NoAllocation
              public String stringConvReturnMethod() {
                String s = "" + getInt();
                return s;
              }

              @NoAllocation
              public String stringConvCompoundAssign(int i) {
                String s = "";
                s += i;
                return s;
              }

              @NoAllocation
              public String stringConvCompoundReturnMethod() {
                String s = "";
                s += getInt();
                return s;
              }

              // Trigger on string concatenation.
              @NoAllocation
              public String doubleString(String s) {
                return s + s;
              }

              @NoAllocation
              public String doubleStringCompound(String s) {
                s += s;
                return s;
              }

              // Trigger on foreach with non-array.
              @NoAllocation
              public int iteration(Iterable<Object> a) {
                int result = 0;
                for (Object o : a) {
                  result++;
                }
                return result;
              }

              // Trigger on autoboxing.
              @NoAllocation
              public Integer assignBox(int i) {
                Integer in;
                in = i;
                return in;
              }

              @NoAllocation
              public Integer initializeBox(int i) {
                Integer in = i;
                return in;
              }

              @NoAllocation
              public Integer initializeBoxLiteral() {
                Integer in = 0;
                return in;
              }

              @NoAllocation
              public int castBox(int i) {
                int in = (Integer) i;
                return in;
              }

              @NoAllocation
              public Integer returnBox(int i) {
                return i;
              }

              @NoAllocation
              public int unBox(Integer i) {
                return i;
              }

              @NoAllocation
              public void callBox(int i) {
                unBox(i);
              }

              @NoAllocation
              public int unBox2(int i1, Integer i2) {
                return i2;
              }

              @NoAllocation
              public void callBox2(int i1, int i2) {
                unBox2(i1, i2);
              }

              @NoAllocation
              public int unBox3(Integer i1, int i2) {
                return i1;
              }

              @NoAllocation
              public void callBox3(int i1, int i2) {
                unBox3(i1, i2);
              }

              @NoAllocation
              public int varArgsMethod(int a, int... b) {
                return a + b[0];
              }

              @NoAllocation
              public void callVarArgs0() {
                varArgsMethod(0);
              }

              @NoAllocation
              public void callVarArgs() {
                varArgsMethod(1, 2);
              }

              @NoAllocation
              public void callVarArgs2() {
                varArgsMethod(1, 2, 3);
              }

              @NoAllocation
              public Object varArgsMethodObject(Object a, Object... b) {
                return b[0];
              }

              @NoAllocation
              public void callVarArgsObject(Object a, Object[] b) {
                varArgsMethodObject(a, b[0]);
              }

              @NoAllocation
              public void callVarArgsObjectWithPrimitiveArray(Object a, int[] b) {
                varArgsMethodObject(a, b);
              }

              @NoAllocation
              public int forBox(int[] a) {
                int count = 0;
                for (Integer i = 0; i < a.length; i++) {
                  count++;
                }
                return count;
              }

              @NoAllocation
              public void arrayBox(Integer[] a, int i) {
                a[0] = i;
              }

              @NoAllocation
              public int preIncrementBox(Integer i) {
                ++i;
                return i;
              }

              @NoAllocation
              public int postIncrementBox(Integer i) {
                i++;
                return i;
              }

              @NoAllocation
              public int preDecrementBox(Integer i) {
                --i;
                return i;
              }

              @NoAllocation
              public int postDecrementBox(Integer i) {
                i--;
                return i;
              }

              @NoAllocation
              public int forEachBox(int[] a) {
                int last = -1;
                for (Integer i : a) {
                  last = i;
                }
                return last;
              }

              @NoAllocation
              public void arrayPreIncrementBox(Integer[] a) {
                ++a[0];
              }

              @NoAllocation
              public void arrayPostIncrementBox(Integer[] a) {
                a[0]++;
              }

              @NoAllocation
              public void arrayPreDecrementBox(Integer[] a) {
                --a[0];
              }

              @NoAllocation
              public void arrayPostDecrementBox(Integer[] a) {
                a[0]--;
              }

              @NoAllocation
              public int compoundBox(Integer a, int b) {
                a += b;
                return a;
              }

              @NoAllocation
              public void arrayCompoundBox(Integer[] a, int b) {
                a[0] += b;
              }

              @NoAllocation
              public void andAssignmentBox(Integer i1, Integer i2) {
                i1 &= i2;
              }

              @NoAllocation
              public void divideAssignmentBox(Integer i1, Integer i2) {
                i1 /= i2;
              }

              @NoAllocation
              public void leftShiftAssignmentBox(Integer i1, Integer i2) {
                i1 <<= i2;
              }

              @NoAllocation
              public void minusAssignmentBox(Integer i1, Integer i2) {
                i1 -= i2;
              }

              @NoAllocation
              public void multiplyAssignmentBox(Integer i1, Integer i2) {
                i1 *= i2;
              }

              @NoAllocation
              public void orAssignmentBox(Integer i1, Integer i2) {
                i1 |= i2;
              }

              @NoAllocation
              public void plusAssignmentBox(Integer i1, Integer i2) {
                i1 += i2;
              }

              @NoAllocation
              public void remainderAssignmentBox(Integer i1, Integer i2) {
                i1 %= i2;
              }

              @NoAllocation
              public void rightShiftAssignmentBox(Integer i1, Integer i2) {
                i1 >>= i2;
              }

              @NoAllocation
              public void unsignedRightShiftAssignmentBox(Integer i1, Integer i2) {
                i1 >>>= i2;
              }

              @NoAllocation
              public void xorAssignmentBox(Integer i1, Integer i2) {
                i1 ^= i2;
              }

              // Cloning is right out.
              @NoAllocation
              public Object doClone() throws CloneNotSupportedException {
                return clone();
              }

              // Throwing doesn't exempt through method declarations.
              @NoAllocation
              public String throwForeach(final Iterable<Object> a) {
                throw new RuntimeException() {
                  @NoAllocation
                  private void f() {
                    for (Object o : a) {
                      a.toString();
                    }
                  }
                };
              }

              public interface NoAllocationInterface {
                @NoAllocation
                void method();
              }

              public static class NoAllocationImplementingClass implements NoAllocationInterface {
                @Override
                public void method() {}
              }

              public abstract static class NoAllocationAbstractClass {
                @NoAllocation
                abstract void method();
              }

              public static class NoAllocationConcreteClass extends NoAllocationAbstractClass {
                @Override
                void method() {}
              }

              public static class NoAllocationParentClass implements NoAllocationInterface {
                @Override
                @NoAllocation
                public void method() {}
              }

              public static class NoAllocationSubclass extends NoAllocationParentClass {
                @Override
                public void method() {}
              }
            }

static class Neg {
  @NoAllocation
  public boolean comparison(int n) {
    return n > 1;
  }

  @NoAllocation
  public void callNoAllocationMethod() {
    comparison(5);
  }

  @NoAllocation
  @SuppressWarnings({"foo, bar"})
  public void annotatedWithArray() {}

  @NoAllocation
  public boolean arrayComparison(int[] a) {
    return a.length > 0 && a[0] > 1;
  }

  // Non string operations are fine.
  @NoAllocation
  public int sumInts(int a, int b) {
    return a + b;
  }

  @NoAllocation
  public int addOne(int a) {
    a += 1;
    return a;
  }

  // Foreach is allowed on arrays.
  @NoAllocation
  public int forEachArray(int[] a) {
    int last = -1;
    for (int i : a) {
      last = i;
    }
    return last;
  }

  // Varargs is ok if no autoboxing occurs.
  @NoAllocation
  public int varArgsMethod2(int a, int... b) {
    return a + b[0];
  }

  @NoAllocation
  public void callVarArgsNoAllocation(int[] b) {
    varArgsMethod2(1, b);
  }

  @NoAllocation
  public Object varArgsMethodObject2(Object a, Object... b) {
    return b[0];
  }

  @NoAllocation
  public void callVarArgsObject2(Object a, Object[] b) {
    varArgsMethodObject2(a, b);
  }

  // Unboxing is fine.
  @NoAllocation
  public void unboxByCalling(Integer i) {
    comparison(i);
  }

  @NoAllocation
  public int binaryUnbox(Integer a, int b) {
    return a + b;
  }

  // We can call a non-annotated method if we suppress warnings.
  @NoAllocation
  @SuppressWarnings("NoAllocation")
  public void trustMe() {
    String s = new String();
  }

  @NoAllocation
  public void trusting() {
    trustMe();
  }

  // Allocations are allowed in a throw statement.
  @NoAllocation
  public void throwNew() {
    throw new RuntimeException();
  }

  @NoAllocation
  public void throwNewArray() {
    throw new RuntimeException(Arrays.toString(new int[10]));
  }

  @NoAllocation
  public void throwMethod() {
    throw new RuntimeException(Integer.toString(5));
  }

  @NoAllocation
  public void throwStringConcatenation() {
    throw new RuntimeException("a" + 5);
  }

  @NoAllocation
  public void throwStringConcatenation2() {
    throw new RuntimeException("a" + Integer.toString(5));
  }

  @NoAllocation
  public void throwStringConcatenation3() {
    throw new RuntimeException("a" + getInt());
  }

  @NoAllocation
  public String throwStringConvCompoundAssign(int i) {
    String s = "";
    throw new RuntimeException(s += i);
  }

  class IntegerException extends RuntimeException {
    public IntegerException(Integer i) {
      super(i.toString());
    }
  }

  @NoAllocation
  public String throwBoxingCompoundAssign(Integer in, int i) {
    throw new IntegerException(in += i);
  }

  @NoAllocation
  public String throwBoxingAssign(Integer in, int i) {
    throw new IntegerException(in = i);
  }

  @NoAllocation
  public String throwBoxingInitialization(final int i) {
    throw new RuntimeException() {
      Integer in = i;
    };
  }

  @NoAllocation
  public String throwBoxingCast(int i) {
    throw new IntegerException((Integer) i);
  }

  @NoAllocation
  public String throwBoxingInvocation(int i) {
    throw new IntegerException(i);
  }

  class VarArgsException extends RuntimeException {
    public VarArgsException(int... ints) {
      super(Arrays.toString(ints));
    }
  }

  @NoAllocation
  public String throwBoxingVarArgs(int i) {
    throw new VarArgsException(i, i, i, 4);
  }

  @NoAllocation
  public String throwBoxingUnary(Integer i) {
    throw new IntegerException(i++);
  }

  @NoAllocation
  public void callGenericMethod() {
    String foo = "foo";
    String bar = genericMethod(foo);
  }

  @NoAllocation
  private static <T> T genericMethod(T value) {
    return value;
  }

  // All of the positive cases with @NoAllocation removed are below.
  public int[] newArray(int size) {
    return new int[size];
  }

  public int[] arrayInitializer(int a, int b) {
    int[] array = {a, b};
    return array;
  }

  public int[] returnArrayInitializer(int a, int b) {
    return new int[] {a, b};
  }

  public String newString(String s) {
    return new String(s);
  }

  public String allocateString() {
    return new String();
  }

  public String getString() {
    return allocateString();
  }

  public int getInt() {
    return 1;
  }

  public String stringConvReturn(int i) {
    return "" + i;
  }

  public String stringConvAssign(int i) {
    String s = "" + i;
    return s;
  }

  public String stringConvAssign2(int i) {
    String s = "";
    s = s + i;
    return s;
  }

  public String stringConvAssign3(int i) {
    String s = "";
    s = i + s;
    return s;
  }

  public String stringConvReturnMethod() {
    String s = "" + getInt();
    return s;
  }

  public String stringConvCompoundAssign(int i) {
    String s = "";
    s += i;
    return s;
  }

  public String stringConvCompoundReturnMethod() {
    String s = "";
    s += getInt();
    return s;
  }

  public String doubleString(String s) {
    return s + s;
  }

  public String doubleStringCompound(String s) {
    s += s;
    return s;
  }

  public int iteration(Iterable<Object> a) {
    int result = 0;
    for (Object o : a) {
      result++;
    }
    return result;
  }

  public Integer assignBox(int i) {
    Integer in;
    in = i;
    return in;
  }

  public Integer initializeBox(int i) {
    Integer in = i;
    return in;
  }

  public Integer initializeBoxLiteral() {
    Integer in = 0;
    return in;
  }

  public int castBox(int i) {
    int in = (Integer) i;
    return in;
  }

  public Integer returnBox(int i) {
    return i;
  }

  public int unBox(Integer i) {
    return i;
  }

  public void callBox(int i) {
    unBox(i);
  }

  public int unBox2(int i1, Integer i2) {
    return i2;
  }

  public void callBox2(int i1, int i2) {
    unBox2(i1, i2);
  }

  public int unBox3(Integer i1, int i2) {
    return i1;
  }

  public void callBox3(int i1, int i2) {
    unBox3(i1, i2);
  }

  public int varArgsMethod(int a, int... b) {
    return a + b[0];
  }

  public void callVarArgs0() {
    varArgsMethod(0);
  }

  public void callVarArgs() {
    varArgsMethod(1, 2);
  }

  public void callVarArgs2() {
    varArgsMethod(1, 2, 3);
  }

  public Object varArgsMethodObject(Object a, Object... b) {
    return b[0];
  }

  public void callVarArgsObject(Object a, Object[] b) {
    varArgsMethodObject(a, b[0]);
  }

  public void callVarArgsObjectWithPrimitiveArray(Object a, int[] b) {
    varArgsMethodObject(a, b);
  }

  public int forBox(int[] a) {
    int count = 0;
    for (Integer i = 0; i < a.length; i++) {
      count++;
    }
    return count;
  }

  public void arrayBox(Integer[] a, int i) {
    a[0] = i;
  }

  public int preIncrementBox(Integer i) {
    ++i;
    return i;
  }

  public int postIncrementBox(Integer i) {
    i++;
    return i;
  }

  public int preDecrementBox(Integer i) {
    --i;
    return i;
  }

  public int postDecrementBox(Integer i) {
    i--;
    return i;
  }

  public int forEachBox(int[] a) {
    int last = -1;
    for (Integer i : a) {
      last = i;
    }
    return last;
  }

  public void arrayPreIncrementBox(Integer[] a) {
    ++a[0];
  }

  public void arrayPostIncrementBox(Integer[] a) {
    a[0]++;
  }

  public void arrayPreDecrementBox(Integer[] a) {
    --a[0];
  }

  public void arrayPostDecrementBox(Integer[] a) {
    a[0]--;
  }

  public int compoundBox(Integer a, int b) {
    a += b;
    return a;
  }

  public void arrayCompoundBox(Integer[] a, int b) {
    a[0] += b;
  }

  public void andAssignmentBox(Integer i1, Integer i2) {
    i1 &= i2;
  }

  public void divideAssignmentBox(Integer i1, Integer i2) {
    i1 /= i2;
  }

  public void leftShiftAssignmentBox(Integer i1, Integer i2) {
    i1 <<= i2;
  }

  public void minusAssignmentBox(Integer i1, Integer i2) {
    i1 -= i2;
  }

  public void multiplyAssignmentBox(Integer i1, Integer i2) {
    i1 *= i2;
  }

  public void orAssignmentBox(Integer i1, Integer i2) {
    i1 |= i2;
  }

  public void plusAssignmentBox(Integer i1, Integer i2) {
    i1 += i2;
  }

  public void remainderAssignmentBox(Integer i1, Integer i2) {
    i1 %= i2;
  }

  public void rightShiftAssignmentBox(Integer i1, Integer i2) {
    i1 >>= i2;
  }

  public void unsignedRightShiftAssignmentBox(Integer i1, Integer i2) {
    i1 >>>= i2;
  }

  public void xorAssignmentBox(Integer i1, Integer i2) {
    i1 ^= i2;
  }

  public Object doClone() throws CloneNotSupportedException {
    return clone();
  }

  @NoAllocation
  public String throwForeach(final Iterable<Object> a) {
    throw new RuntimeException() {
      private void f() {
        for (Object o : a) {
          a.toString();
        }
      }
    };
  }

  public interface NoAllocationInterface {
    @NoAllocation
    void method();
  }

  public static class NoAllocationImplementingClass implements NoAllocationInterface {
    @Override
    @NoAllocation
    public void method() {}
  }

  public static class NoAllocationImplementingClassWithSuppression
      implements NoAllocationInterface {
    @Override
    @SuppressWarnings("NoAllocation")
    public void method() {}
  }

  public abstract static class NoAllocationAbstractClass {
    @NoAllocation
    abstract void method();
  }

  public static class NoAllocationConcreteClass extends NoAllocationAbstractClass {
    @Override
    @NoAllocation
    void method() {}
  }

  public static class NoAllocationConcreteClassWithSuppression extends NoAllocationAbstractClass {
    @Override
    @SuppressWarnings("NoAllocation")
    void method() {}
  }

  public static class NoAllocationParentClass implements NoAllocationInterface {
    @Override
    @NoAllocation
    public void method() {}
  }

  public static class NoAllocationSubclass extends NoAllocationParentClass {
    @Override
    @NoAllocation
    public void method() {}
  }

  public static class NoAllocationSubclassWithSuppression extends NoAllocationParentClass {
    @Override
    @SuppressWarnings("NoAllocation")
    public void method() {}
  }
}


  static class Edge {
    interface Fn {
      Object apply(int x);
    }

    interface Gen<T> {
      @NoAllocation
      void run(T t);
    }

    static class GenImpl implements Gen<String> {
      @Override
      public void run(String s) {}
    }

    abstract static class Base {
      @NoAllocation
      <T> void m(T t) {}

      @NoAllocation
      static void util() {}

      @NoAllocation
      private void hidden() {}
    }

    static class Derived extends Base {
      <T> void m(T t) {}

      static void util() {}

      void hidden() {}
    }

    @NoAllocation
    int[][] nested(int a) {
      return new int[][] {{a}, {a}};
    }

    @NoAllocation
    String constants() {
      return "a" + "b";
    }

    @NoAllocation
    Object lambda(int i) {
      Fn f = x -> x;
      return f.apply(i);
    }

    @NoAllocation
    Fn lambdaReturn() {
      Fn f = x -> {
        return x;
      };
      return f;
    }

    @NoAllocation
    int primitiveReturn() {
      java.util.function.IntSupplier s = () -> {
        return 1;
      };
      return 2;
    }

    @NoAllocation
    void format(int i) {
      throw new RuntimeException(String.format("%d", i));
    }

    @NoAllocation
    java.util.List<String> asList(String[] a, String b) {
      java.util.List<String> one = java.util.Arrays.asList(a);
      return java.util.Arrays.asList(b);
    }

    @NoAllocation
    void anonymous() {
      Runnable r = new Runnable() {
        public void run() {}
      };
    }

    @NoAllocation
    @SuppressWarnings("NoAllocation")
    void suppressed(int i) {
      Object o = new Object();
    }

    @NoAllocation
    void suppressedLocal(int i) {
      @SuppressWarnings("NoAllocation")
      Object o = new Object();
      Integer boxed = i;
    }

    @NoAllocation
    Object ternary(boolean b) {
      Object o = b ? 1 : 2;
      return o;
    }

    @NoAllocation
    long unboxed(Long l, Integer i) {
      long m = l + 1;
      return l + i;
    }

    @NoAllocation
    void chars(char c, String t) {
      String s = "x" + c;
      s += c;
      t += 1;
      String u = t + null;
    }

    @NoAllocation
    Object castObj(int i, Object o) {
      Object a = (Object) i;
      int b = (int) i;
      Object c = (Object) o;
      return (Integer) i;
    }

    @NoAllocation
    void vars(int i, Integer[] boxes, java.util.List<Integer> list) {
      var x = i;
      var y = Integer.valueOf(i);
      for (var z : new int[0]) {}
      for (var w : boxes) {}
      for (int v : boxes) {}
      for (var u : list) {}
      for (Object t : new int[1]) {}
      for (long s : new int[1]) {}
      int p = 1, q = i;
      Long l = 1L;
      Object arr[] = null;
    }

    @NoAllocation
    void creation() {
      new Edge();
      Object o = new Object[] {new Object()};
      int[] a = new int[0];
      Runnable r = Edge::new;
    }

    @NoAllocation
    Edge() {
      super();
    }

    @NoAllocation
    Edge(int i) {
      this();
    }

    @NoAllocation
    Object[] objects(Object... os) {
      return os;
    }

    @NoAllocation
    void callObjects(Object[] a, String[] s, int[] i, Object o) {
      objects(a);
      objects(s);
      objects(i);
      objects(o);
      objects(null);
      objects();
      objects((Object[]) null);
    }

    @NoAllocation
    void incrementBoxed(Integer[] a, Integer b, int c, int[] d) {
      a[c]++;
      b--;
      c++;
      d[0]--;
      ++d[1];
    }

    @NoAllocation
    void generic(java.util.Map<String, Integer> map, Integer k) {
      map.put("a", 1);
      Integer got = map.get("a");
      map.get(k);
      int sum = got + k;
    }

    @NoAllocation
    Integer shifted(Integer a, int b) {
      a <<= b;
      a = a + b;
      return a;
    }

    @NoAllocation
    static void staticCall() {
      util();
    }

    static void util() {}

    @NoAllocation
    void stringSwitch(Object o) {
      Object s = switch (o.hashCode()) {
        case 1 -> "a" + o;
        default -> 1;
      };
    }
  
    @NoAllocation
    String folds(int x, String t) {
      String a = "a" + "b" + x;
      String b = x + "a" + "b";
      String c = x + "a" + "b" + t + "c" + "d";
      boolean d = t == "a" + "b" + x;
      String e = "a" + "b" + "c";
      String f = ("a" + "b") + x;
      String g = t + ("a" + "b");
      String h = x + 1 + "a" + "b" + 2;
      String i = (x + "a" + "b" + 1).trim();
      String j = x > 1 ? "a" + "b" + x : "c" + x;
      boolean k = ("a" + "b" + x).length() - 1 > 0 && "a" + "b" + x == t;
      return "p" + x + "q" + "r";
    }
  }
}
