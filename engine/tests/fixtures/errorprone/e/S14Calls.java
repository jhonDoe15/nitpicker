package e;

import static com.google.common.util.concurrent.Futures.getChecked;
import static java.util.concurrent.TimeUnit.SECONDS;

import java.time.Duration;
import java.time.Period;
import java.time.temporal.TemporalAmount;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Future;

class S14Period {
  private final Period zero = Period.ZERO.plus(Duration.ZERO);
  private final Period oneDay = Period.ZERO.plus(Period.ofDays(1));
  private final Period twoDays = Period.ZERO.minus(Duration.ZERO);
  private final TemporalAmount temporalAmount = Duration.ofDays(3);
  private final Period threeDays = Period.ZERO.plus(temporalAmount);
  private final Period four = Period.ZERO.plusDays(4);
  private final Duration five = Duration.ZERO.plus(Duration.ofDays(1));

  @SuppressWarnings("PeriodTimeMath")
  Period suppressed() {
    return Period.ZERO.plus(Duration.ofHours(48));
  }

  Period nested() {
    Duration d = Duration.ofDays(2);
    return Period.ofDays(1).minus(d);
  }
}

class S14ArrayFill {
  enum Foo {
    BAR,
    BAZ
  }

  void positive(String b, Integer[] o, Number n) {
    Arrays.fill(o, b);
    Arrays.fill(o, 2.0d);
    Arrays.fill(o, n);
  }

  void ternary(Foo[] o, String[] s, boolean flag) {
    Arrays.fill(o, true ? Foo.BAR : Foo.BAZ);
    Arrays.fill(s, true ? "a" : "b");
    Arrays.fill(s, true ? "a" : 123);
    Arrays.fill(s, flag ? 123 : "a");
  }

  void boxing(int i, long l, Integer[] o, Long[] longs, Object[] objects, Number[] numbers) {
    Arrays.fill(o, 1);
    Arrays.fill(o, i);
    Arrays.fill(o, 0, 4, i);
    Arrays.fill(o, l);
    Arrays.fill(o, 4L);
    Arrays.fill(o, 0, 4, l);
    Arrays.fill(longs, true ? 1 : 2L);
    Arrays.fill(o, true ? 1 : 2L);
    Arrays.fill(objects, i);
    Arrays.fill(numbers, i);
    Arrays.fill(numbers, "s");
    Arrays.fill(o, null);
  }

  void others(int[] ints, List<String>[] lists, List<Integer> numbers, java.util.Date[] dates, String[][] nested, String[] strings, Object[] objects) {
    Arrays.fill(ints, 3);
    Arrays.fill(lists, numbers);
    Arrays.fill(nested, strings);
    Arrays.fill(nested, new String[0]);
    Arrays.fill(nested, objects);
    Arrays.fill(dates, new java.sql.Date(0));
    Arrays.fill(dates, new java.sql.Timestamp(0));
    Arrays.fill(dates, "x");
  }

  <T extends CharSequence> void generic(T[] values, T value, String text, Integer number) {
    Arrays.fill(values, value);
    Arrays.fill(values, text);
    Arrays.fill(values, number);
  }

  @SuppressWarnings("ArrayFillIncompatibleType")
  void suppressed(Integer[] o) {
    Arrays.fill(o, "s");
  }
}

class S14IsInstance {
  boolean enclosingGetClass(Class<?> clazz) {
    return getClass().isInstance(clazz);
  }

  boolean getClassEnclosing(Class<?> clazz) {
    return clazz.isInstance(getClass());
  }

  boolean getClassGetClass(Object a, Object b) {
    return a.getClass().isInstance(b.getClass());
  }

  boolean getClassLiteral(Object obj) {
    return obj.getClass().isInstance(String.class);
  }

  boolean literalGetClass(Object obj) {
    return String.class.isInstance(obj.getClass());
  }

  boolean literalLiteral(Object obj) {
    return Number.class.isInstance(String.class);
  }

  boolean clazzGetClass(Object o, Class<?> clazz) {
    return clazz.isInstance(o.getClass());
  }

  boolean getClassClazz(Object o, Class<?> clazz) {
    return o.getClass().isInstance(clazz);
  }

  boolean clazzLiteral(Class<?> clazz) {
    return clazz.isInstance(String.class);
  }

  boolean literalClazz(Class<?> clazz) {
    return String.class.isInstance(clazz);
  }

  boolean clazzClazz(Class<?> a, Class<?> b) {
    return a.isInstance(b);
  }

  boolean arrayLiteral(Object obj) {
    return obj.getClass().isInstance(String[].class);
  }

  boolean negatives(Object o, Class<?> clazz) {
    return clazz.isInstance(o) || String.class.isInstance(o) || o.getClass().isInstance(o);
  }

  @SuppressWarnings("IsInstanceOfClass")
  boolean suppressed(Class<?> clazz) {
    return clazz.isInstance(clazz);
  }
}

class S14Futures {
  <T extends RuntimeException> void runtime(Future<?> future, Class<? extends RuntimeException> c1, Class<T> c2) throws Exception {
    getChecked(future, RuntimeException.class);
    getChecked(future, IllegalArgumentException.class);
    getChecked(future, RuntimeException.class, 0, SECONDS);
    getChecked(future, c1);
    getChecked(future, c2);
  }

  void visibility(Future<?> future) throws Exception {
    getChecked(future, PrivateConstructorException.class);
    getChecked(future, PackagePrivateConstructorException.class);
    getChecked(future, ProtectedConstructorException.class);
  }

  void parameters(Future<?> future) throws Exception {
    getChecked(future, OtherParameterTypeException.class);
    getChecked(future, InnerClassWithExplicitConstructorException.class);
    getChecked(future, InnerClassWithImplicitConstructorException.class);
  }

  <T extends Exception> void negatives(Future<?> future, Class<? extends Exception> c1, Class<T> c2) throws Exception {
    getChecked(future, Exception.class);
    getChecked(future, Exception.class, 0, SECONDS);
    getChecked(future, java.io.IOException.class);
    getChecked(future, c1);
    getChecked(future, c2);
    getChecked(future, null);
    getChecked(future, StaticNestedWithExplicitConstructorException.class);
    getChecked(future, StaticNestedWithImplicitConstructorException.class);
    getChecked(future, StringConstructorException.class);
    getChecked(future, ThrowableConstructorException.class);
  }

  @SuppressWarnings("FuturesGetCheckedIllegalExceptionType")
  void suppressed(Future<?> future) throws Exception {
    getChecked(future, RuntimeException.class);
  }

  static class PackageDefault extends Exception {}

  void packageDefault(Future<?> future) throws Exception {
    getChecked(future, PackageDefault.class);
  }

  public static class PrivateConstructorException extends Exception {
    private PrivateConstructorException() {}
  }

  public static class PackagePrivateConstructorException extends Exception {
    PackagePrivateConstructorException() {}
  }

  public static class ProtectedConstructorException extends Exception {
    protected ProtectedConstructorException() {}
  }

  public class OtherParameterTypeException extends Exception {
    public OtherParameterTypeException(int it) {}
  }

  public class InnerClassWithExplicitConstructorException extends Exception {
    public InnerClassWithExplicitConstructorException() {}
  }

  public class InnerClassWithImplicitConstructorException extends Exception {}

  public static class StaticNestedWithExplicitConstructorException extends Exception {
    public StaticNestedWithExplicitConstructorException() {}
  }

  public static class StaticNestedWithImplicitConstructorException extends Exception {}

  public static class StringConstructorException extends Exception {
    public StringConstructorException(String message) {}
  }

  public static class ThrowableConstructorException extends Exception {
    public ThrowableConstructorException(String message, Throwable cause) {}
  }
}
