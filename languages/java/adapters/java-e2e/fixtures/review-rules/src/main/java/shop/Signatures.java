package shop;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.BlockingQueue;

public final class Signatures {
  private Signatures() {}

  public record Options(Boolean verbose, boolean quiet) {} // violation: TriStateBoolean

  @interface JsonProperty {
    String value();
  }

  public record Payload(@JsonProperty("verbose") Boolean verbose) {}

  public static String describe(@JsonProperty("force") Boolean force) {
    return "force=" + force;
  }

  public static boolean isForced(Boolean force) { // violation: TriStateBoolean
    return force != null && force;
  }

  public static boolean isQuiet(boolean quiet, Map<String, Boolean> seen) {
    return quiet || seen.isEmpty();
  }

  public static void addTo(List<String> items, String item) {
    items.add(item); // violation: ParameterMutation
  }

  public static void sortAll(String[] names) {
    Arrays.sort(names, 0, names.length); // violation: ParameterMutation
  }

  public static void clearFirst(int[] counts) {
    counts[0] = 0; // violation: ParameterMutation
  }

  public static void collect(List<String> items) {
    Collections.addAll(items, "a", "b"); // violation: ParameterMutation
  }

  public static void setCell(int[][] grid) {
    grid[0][1] = 3; // violation: ParameterMutation
  }

  public static int firstTwo(int[] values) {
    int v = values[0];
    int t = 0;
    t += values[1];
    return v + t;
  }

  private static void fill(List<String> items) {
    items.add("x");
  }

  public static void drain(BlockingQueue<String> queue) {
    queue.offer("x");
  }

  public static final class Holder {
    private final List<String> kept;

    public Holder(List<String> items) {
      this.kept = items;
      this.kept.add("x"); // violation: ParameterMutation
    }
  }

  public static void late(List<String> items) {
    items.add("x"); // violation: ParameterMutation
    items = new ArrayList<>(items);
  }

  public static List<String> withItem(List<String> items, String item) {
    List<String> copy = new ArrayList<>(items);
    copy.add(item);
    return copy;
  }

  public static List<String> rebuilt(List<String> items) {
    items = new ArrayList<>(items);
    items.add("last");
    return items;
  }

  @Deprecated // violation: CompatibilityShim
  public static long totalCents(List<Long> cents) {
    return Prices.sum(cents);
  }

  public static Calendar now() {
    return Calendar.getInstance(); // violation: LegacyCalendarApi
  }

  public static Calendar zoned(TimeZone zone) {
    Calendar calendar = Calendar.getInstance(zone);
    calendar.clear();
    return calendar;
  }

  public static Object calendar() {
    return new GregorianCalendar(); // violation: LegacyCalendarApi
  }

  public static Object format() {
    return new SimpleDateFormat("yyyy-MM-dd"); // violation: LegacyCalendarApi
  }

  public static Calendar localized() {
    return Calendar.getInstance(Locale.ROOT); // violation: LegacyCalendarApi
  }

  public static SimpleDateFormat utcFormat() {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return format;
  }
}
