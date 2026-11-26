package e;

import java.util.concurrent.TimeUnit;
import java.util.function.IntSupplier;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

class B6Time {
  static final int MS_PER_SEC = 1000;
  long startNanos;
  long timeoutMillis;
  int delaySeconds;
  double elapsedUs;

  void takesMillis(long timeoutMillis) {}

  void takesNanos(long timeoutNanos, int count) {}

  void setTimeoutSeconds(int value) {}

  B6Time() {}

  B6Time(long delayMillis) {}

  long getFooSeconds() {
    return 5;
  }

  long positive(long fooSeconds, long barMillis, int someNanos, Supplier<Long> fooSecondsSupplier) {
    takesMillis(fooSeconds);
    takesMillis(someNanos);
    takesMillis(fooSeconds * 1000);
    takesMillis(fooSeconds * MS_PER_SEC);
    takesMillis(1000 * fooSeconds);
    takesMillis(someNanos / 1000000);
    takesNanos(barMillis, 1);
    takesNanos(barMillis * 1000, 1);
    setTimeoutSeconds(someNanos);
    new B6Time(fooSeconds);
    timeoutMillis = fooSeconds;
    this.startNanos = barMillis;
    long deadlineSeconds = barMillis;
    long ok = fooSeconds + barMillis;
    boolean late = fooSeconds > barMillis;
    boolean same = barMillis == someNanos;
    long diff = someNanos - fooSeconds;
    long ternary = late ? fooSeconds : barMillis;
    takesMillis(getFooSeconds());
    takesMillis(fooSecondsSupplier.get());
    takesMillis((long) fooSeconds);
    takesMillis(this.delaySeconds);
    TimeUnit.SECONDS.toMillis(barMillis);
    TimeUnit.MILLISECONDS.toNanos(fooSeconds);
    TimeUnit.NANOSECONDS.toMicros(barMillis);
    takesMillis((long) elapsedUs);
    return barMillis;
  }

  long returnsSeconds(long barMillis) {
    return barMillis;
  }

  long getTimeoutMillis(long fooSeconds) {
    return fooSeconds;
  }

  void lambdas(long fooSeconds, long barMillis) {
    LongSupplier supplier = () -> {
      return fooSeconds;
    };
    LongSupplier ref = this::getFooSeconds;
    IntSupplier millisRef = () -> 1;
  }

  void negative(long fooSeconds, long barMillis, int count, long second, long firstTimestamp, long secondTimestamp) {
    takesMillis(barMillis);
    takesMillis(count);
    takesMillis(second);
    takesMillis(fooSeconds * 1000 / 1000);
    takesNanos(secondTimestamp, 1);
    long fromNanos = fooSeconds;
    long twoSeconds = barMillis;
    long same = fooSeconds + fooSeconds;
    boolean c = firstTimestamp > secondTimestamp;
    long x = fooSeconds + count;
    TimeUnit.SECONDS.toMillis(fooSeconds);
    TimeUnit.MILLISECONDS.toSeconds(barMillis);
    setTimeoutSeconds(count);
    long multi = barMillis;
    long millisToNanos = fooSeconds;
    float floatSeconds = 1;
    takesMillis((long) floatSeconds);
    Long boxedMillis = Long.valueOf(fooSeconds);
  }

  @SuppressWarnings("TimeUnitMismatch")
  void suppressed(long fooSeconds) {
    takesMillis(fooSeconds);
  }

  static long nanosToMillis(long nanos) {
    return nanos / 1000000;
  }

  long viaMethod(long fooSeconds, long barNanos) {
    long totalMillis = nanosToMillis(barNanos);
    long wrongMillis = nanosToMillis(fooSeconds);
    long wrongSeconds = barNanos / 1000000;
    long goodMillis = barNanos / 1000000;
    long bigMicros = fooSeconds * 1000;
    long hoursMillis = fooSeconds / 60;
    return totalMillis;
  }
}
