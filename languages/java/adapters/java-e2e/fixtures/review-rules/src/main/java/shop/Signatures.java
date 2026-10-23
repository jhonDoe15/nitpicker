package shop;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Map;

public final class Signatures {
  private Signatures() {}

  public record Options(Boolean verbose, boolean quiet) {} // violation: TriStateBoolean

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

  public static Object calendar() {
    return new GregorianCalendar(); // violation: LegacyCalendarApi
  }

  public static Object format() {
    return new SimpleDateFormat("yyyy-MM-dd"); // violation: LegacyCalendarApi
  }
}
