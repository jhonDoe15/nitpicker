import java.io.Console;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.util.Calendar;
import java.util.Date;
import java.util.Formatter;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

class F43ProbeFormat<T, N extends Number, S extends CharSequence> {
  static final String CONSTANT = "%d %s";
  static final char CHAR = 'x';
  static final byte BYTE = -1;
  static final int BAD_POINT = 0x110000;
  static final long LONG = 5L;

  void types(BigDecimal decimal, BigInteger integer, Date date, Calendar calendar, GregorianCalendar gregorian,
      Instant instant, LocalDate local, LocalDateTime localTime, ZonedDateTime zoned, Number number, Integer boxed,
      AtomicInteger atomic, Object object, List<String> list, T t, N n, S s, int[] ints, String[] strings, Object[] objects,
      boolean flag, Boolean boxedFlag, Character character, char c, long l, float f, double d, short sh, byte b) {
    String.format("%d", decimal);
    String.format("%f", integer);
    String.format("%tY", date);
    String.format("%tY %tH", calendar, gregorian);
    String.format("%tY", instant);
    String.format("%tF", instant);
    String.format("%tQ %ts", instant, instant);
    String.format("%tY", local);
    String.format("%tH", localTime);
    String.format("%c", number);
    String.format("%c", boxed);
    String.format("%d", atomic);
    String.format("%d", object);
    String.format("%d", list);
    String.format("%d", t);
    String.format("%d", n);
    String.format("%d", s);
    String.format("%d", ints);
    String.format("%s %s", strings);
    String.format("%s %s", objects);
    String.format("%s", objects, objects);
    String.format("%d", flag);
    String.format("%b %c", boxedFlag, character);
    String.format("%d", c);
    String.format("%c", l);
    String.format("%d", f);
    String.format("%x", d);
    String.format("%c %c", sh, b);
    String.format("%+x", b);
    String.format("%c", CHAR);
    String.format("%d", CHAR);
    String.format("%c", BYTE);
    String.format("%c", BAD_POINT);
    String.format("%c", (int) 'a');
    String.format("%d", 'a');
    String.format("%s", null);
    String.format("%d", (Object) null);
    String.format(CONSTANT, 1, "a", 3);
    String.format(flag ? "%d" : "%s", "x");
    String.format(flag ? CONSTANT : "%s", 1);
    String.format((flag ? "%d" : "%s"), "x");
    String.format("%d" + "%s", 1);
    String.format(Locale.ROOT, "%" + LONG + "d", 1);
    String.format(Locale.ROOT, "%" + LONG + "d", "x");
    String.format(Locale.ROOT, "%d", "x");
    String.format("%l", 1);
    String.format("%q", 1);
    String.format("%-d", 1);
    String.format("%,s", "x");
    String.format("%1$s %3$s", "a", "b");
    String.format("%<s", "a");
    String.format("%s", "a", "b", "c");
    String.format("%n%%", "a");
    "%d".formatted("x");
    ("%s" + "%s").formatted("x");
    String.valueOf(1).formatted("x");
  }

  void sinks(PrintStream out, PrintWriter writer, Formatter formatter, Console console, StringBuilder builder) {
    out.printf("%d%n", "x");
    out.format(Locale.US, "%d", "x");
    writer.printf("%s %s", 1);
    formatter.format("%d", 1.5);
    console.readLine("%d", "x");
    console.readPassword("%s %s", "x");
    console.printf("%d", "x");
    System.err.printf("%c", -5);
  }

  void unicode() {
    String.format("%c", 0x1F600);
    String.format("é%q");
    String.format("%t");
    String.format("%5t!", 1);
    String.format("%tq", 1L);
  }
}
