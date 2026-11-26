package e;

import static com.google.common.base.Preconditions.checkNotNull;

import com.google.common.base.Preconditions;
import com.google.protobuf.Duration;
import com.google.protobuf.GeneratedMessage;
import com.google.protobuf.Timestamp;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

class S19Calls {
  Object field = new Object();

  void repeated() {
    Object someObject = new Object();
    Preconditions.checkNotNull(someObject, someObject);
    checkNotNull(someObject, someObject);
    Preconditions.checkNotNull(
        someObject,
        "%s must not be null",
        someObject);
    String s = "test string";
    Preconditions.checkNotNull(s, s, s);
    Preconditions.checkNotNull(s, "x %s", "y", s);
    Preconditions.checkNotNull(field, field);
    Preconditions.checkNotNull(this.field, this.field);
    Preconditions.checkNotNull(this.field, field);
    Preconditions.checkNotNull(field, this.field);
    Preconditions.checkNotNull(s, ( s ));
  }

  void repeatedNegative() {
    Object obj = new Object();
    Object other = new Object();
    Preconditions.checkNotNull(obj);
    Preconditions.checkNotNull(obj, "obj");
    Preconditions.checkNotNull(obj, "check with message");
    Preconditions.checkNotNull(obj, "check with msg and an arg %s", new Object());
    Preconditions.checkNotNull(obj, other);
    Preconditions.checkNotNull(obj.toString(), obj.toString());
    Preconditions.checkNotNull(field, new Object());
  }

  @SuppressWarnings("PreconditionsCheckNotNullRepeated")
  void repeatedSuppressed() {
    Object o = new Object();
    Preconditions.checkNotNull(o, o);
  }

  void repeatedShadow(Object field) {
    Preconditions.checkNotNull(field, this.field);
    Preconditions.checkNotNull(field, field);
  }

  public void objectVarargsMethod(Object... objs) {}

  public <T> void genericVarargsMethod(T... genericArrays) {}

  public void objectVarargsMethodWithMultipleParams(Object obj1, Object... objs) {}

  public void intVarargsMethod(int... ints) {}

  public void intArrayVarargsMethod(int[]... intArrays) {}

  public void longVarargsMethod(long... longs) {}

  public void numberVarargs(Number... numbers) {}

  public void boundedVarargs(Comparable<?>... comparables) {}

  public void doIt() {
    int[] intArray = {1, 2, 3};
    objectVarargsMethod(intArray);
    genericVarargsMethod(intArray);
    objectVarargsMethodWithMultipleParams(new Object(), intArray);
    Arrays.asList(intArray);
    char[] chars = {'a'};
    String.format("%s", chars);
    boolean[] flags = {};
    objectVarargsMethod(flags);
    this.<int[]>genericVarargsMethod(intArray);
    objectVarargsMethod(new byte[0]);
    objectVarargsMethod(new int[0][0]);
    objectVarargsMethod((Object) intArray);
    objectVarargsMethod(intArray, intArray);
    objectVarargsMethod();
    objectVarargsMethod(new Integer[0]);
  }

  public void doItNegative() {
    int[] intArray = {1, 2, 3};
    intVarargsMethod(intArray);
    intArrayVarargsMethod(intArray);
    objectVarargsMethodWithMultipleParams(new Object());
    intVarargsMethod(1, 2);
    objectVarargsMethod(1, 2);
    objectVarargsMethod((Object[]) null);
    genericVarargsMethod(new String[0]);
    long[] longs = {};
    longVarargsMethod(longs);
  }

  @SuppressWarnings("PrimitiveArrayPassedToVarargsMethod")
  public void doItSuppressed() {
    objectVarargsMethod(new int[0]);
  }

  private AtomicReference<Integer> ref = new AtomicReference<>();
  private AtomicReference<Long> longRef = new AtomicReference<>();
  private AtomicReference<Boolean> boolRef = new AtomicReference<>();
  private AtomicReference<Character> charRef = new AtomicReference<>();
  private AtomicReference<String> stringRef = new AtomicReference<>();
  private AtomicReference<? extends Integer> wildRef = new AtomicReference<>();
  @SuppressWarnings("rawtypes")
  private AtomicReference raw = new AtomicReference();

  static class IntRef extends AtomicReference<Integer> {}

  static class Generic<T extends Integer, U> {
    AtomicReference<T> bounded = new AtomicReference<>();
    AtomicReference<U> free = new AtomicReference<>();

    boolean f(T t, U u) {
      return bounded.compareAndSet(t, t) | free.compareAndSet(u, u);
    }
  }

  static class SubRef<X> extends AtomicReference<String> {
    boolean f(SubRef<Integer> other, Integer i) {
      return other.compareAndSet("a", "b");
    }
  }

  public boolean cas(int i) {
    boolean a = ref.compareAndSet(i, 10);
    boolean b = ref.weakCompareAndSet(i, 10);
    boolean c = longRef.compareAndSet(1L, 2L);
    boolean d = boolRef.compareAndSet(true, false);
    boolean e = charRef.compareAndSet('a', 'b');
    boolean f = ref.compareAndSet(null, 10);
    boolean g = ref.compareAndSet(i, null);
    boolean h = stringRef.compareAndSet("a", "b");
    boolean j = wildRef.compareAndSet(null, null);
    boolean k = raw.compareAndSet(1, 2);
    boolean l = new IntRef().compareAndSet(1, 2);
    Integer boxed = 1;
    boolean m = ref.compareAndSet(boxed, boxed);
    boolean n = ref.get() == 1;
    return a;
  }

  @SuppressWarnings("PrimitiveAtomicReference")
  public boolean casSuppressed(int i) {
    return ref.compareAndSet(i, 10);
  }

  static class Holder extends GeneratedMessage {
    Duration getDuration() {
      return null;
    }

    Timestamp getTimestamp() {
      return null;
    }

    Holder getHolder() {
      return null;
    }

    int getSerializedSize() {
      return 0;
    }
  }

  static class Protos {
    static final Duration DURATION = Duration.getDefaultInstance();
    static final long SECONDS = DURATION.getSeconds();
    final Duration instanceDuration = Duration.getDefaultInstance();
    final long instanceSeconds = instanceDuration.getSeconds();
    final int instanceNanos = instanceDuration.getNanos();
    final int onlyNanos = Duration.getDefaultInstance().getNanos();

    static {
      long seconds = Duration.getDefaultInstance().getSeconds();
      int nanos = Duration.getDefaultInstance().getNanos();
    }

    Object obj = new Object() {
      long nanos = DURATION.getNanos();
    };

    static void both(Duration duration) {
      long seconds = duration.getSeconds();
      int nanos = duration.getNanos();
    }

    static int returned(Duration duration) {
      return duration.getNanos();
    }

    static void differentScope(Duration duration) {
      long seconds = duration.getSeconds();
      if (seconds > 0) {
        int nanos = duration.getNanos();
      }
    }

    static void differentMethods(Duration duration) {
      long seconds = duration.getSeconds();
    }

    static void differentMethods2(Duration duration) {
      int nanos = duration.getNanos();
    }

    static void classVariable() {
      int nanos = DURATION.getNanos();
    }

    static void lambdaSeconds() {
      Runnable r = () -> DURATION.getSeconds();
      int nanos = DURATION.getNanos();
    }

    static void lambdaNanos() {
      Runnable r = () -> DURATION.getNanos();
      long seconds = DURATION.getSeconds();
    }

    static void innerClass() {
      long seconds = DURATION.getSeconds();
      Object o =
          new Object() {
            public String toString() {
              return String.valueOf(DURATION.getNanos());
            }
          };
    }

    static void chains(Holder holder, Holder other) {
      long seconds = holder.getDuration().getSeconds();
      int nanos = holder.getDuration().getNanos();
      int otherNanos = other.getDuration().getNanos();
      long deepSeconds = holder.getHolder().getDuration().getSeconds();
      int deepNanos = holder.getHolder().getDuration().getNanos();
      int deepOther = holder.getHolder().getHolder().getDuration().getNanos();
    }

    static void chainsOther(Holder holder) {
      long seconds = holder.getHolder().getDuration().getSeconds();
      int nanos = holder.getDuration().getNanos();
    }

    static void ts(Holder holder, Timestamp stamp) {
      long seconds = holder.getTimestamp().getSeconds();
      int nanos = holder.getTimestamp().getNanos();
      int stampNanos = stamp.getNanos();
      long stampSeconds = stamp.getSeconds();
      int again = stamp.getNanos();
    }

    static void tsOnly(Timestamp stamp, Holder holder) {
      int nanos = stamp.getNanos();
      int viaHolder = holder.getTimestamp().getNanos();
    }

    static void bareChain(Holder holder) {
      long seconds = holder.getHolder().getDuration().getSeconds();
      int nanos = (holder).getHolder().getDuration().getNanos();
      int nanos2 = holder.getHolder().getDuration().getNanos();
    }

    @SuppressWarnings("ProtoDurationGetSecondsGetNano")
    static int suppressed(Duration duration) {
      return duration.getNanos();
    }

    @SuppressWarnings("ProtoTimestampGetSecondsGetNano")
    static int suppressedTs(Timestamp duration) {
      return duration.getNanos();
    }
  }
}
