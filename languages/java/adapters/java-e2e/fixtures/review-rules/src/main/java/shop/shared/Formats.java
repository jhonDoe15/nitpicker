package shop.shared;

import java.text.NumberFormat;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.time.format.DateTimeFormatter;
import java.util.Calendar;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

public final class Formats {
  private static final SimpleDateFormat DAY = // violation: SharedStatefulHelperField
      new SimpleDateFormat("yyyy-MM-dd"); // violation: LegacyCalendarApi
  private static final Matcher DIGITS = Pattern.compile("\\d+").matcher(""); // violation: SharedStatefulHelperField
  static final Calendar CLOCK = Calendar.getInstance(); // violation: SharedStatefulHelperField, LegacyCalendarApi
  private static final SimpleDateFormat GUARDED = new SimpleDateFormat("HH:mm"); // violation: LegacyCalendarApi
  private static final ThreadLocal<SimpleDateFormat> LOCAL =
      ThreadLocal.withInitial(() -> new SimpleDateFormat("MM")); // violation: LegacyCalendarApi
  private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final Pattern WORDS = Pattern.compile("\\w+");
  private static final Calendar PROTOTYPE = Calendar.getInstance(); // violation: LegacyCalendarApi
  private static final Calendar ZONE = Calendar.getInstance(); // violation: LegacyCalendarApi
  private final NumberFormat perInstance = NumberFormat.getInstance();

  public static String day(Date date) {
    return DAY.format(date);
  }

  public static boolean digits(String text) {
    return DIGITS.reset(text).matches();
  }

  public static String time(Date date) {
    synchronized (GUARDED) {
      return GUARDED.format(date);
    }
  }

  public static String month(Date date) {
    return LOCAL.get().format(date);
  }

  public static String iso(java.time.LocalDate date) {
    return ISO.format(date);
  }

  public static boolean words(String text) {
    Matcher matcher = WORDS.matcher(text);
    return matcher.find();
  }

  public static int clock() {
    return CLOCK.get(Calendar.HOUR);
  }

  public static Calendar fresh() {
    return (Calendar) PROTOTYPE.clone();
  }

  public static Timestamp stamp(ResultSet rows) throws SQLException {
    return rows.getTimestamp(1, ZONE);
  }

  public String money(double amount) {
    return perInstance.format(amount);
  }

  @Component
  @Lazy
  public static class Injected {
    private final Calendar calendar;

    public Injected(Calendar calendar) {
      this.calendar = calendar;
    }

    public int hour() {
      return calendar.get(Calendar.HOUR);
    }
  }

  @Component
  public static class Mapper {
    private final BeanWrapperImpl wrapper = new BeanWrapperImpl(); // violation: SharedStatefulHelperField

    public Object read(Object target, String property) {
      wrapper.setWrappedInstance(target);
      return wrapper.getPropertyValue(property);
    }

    public Object readLocal(Object target, String property) {
      BeanWrapper local = new BeanWrapperImpl(target);
      return local.getPropertyValue(property);
    }
  }
}
