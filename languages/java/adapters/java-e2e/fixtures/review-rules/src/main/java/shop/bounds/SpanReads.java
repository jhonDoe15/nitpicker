package shop.bounds;

import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;

public final class SpanReads {
  private int max;
  private int nextIndex;

  private SpanReads() {}

  public static int[] bounds(Span range) {
    int max = range.getMin(); // violation: OppositeBoundAssigned
    int min = range.getMin();
    int high = range.getMax();
    return new int[] {min, max, high};
  }

  public static int[] accessors(Span range) {
    int lower = range.getMin();
    int upper = range.max();
    int min = range.max(); // violation: OppositeBoundAssigned
    return new int[] {lower, upper, min};
  }

  public static String[] paths(Span change) {
    String afterPath = change.getBeforePath(); // violation: OppositeBoundAssigned
    String beforePath = change.getBeforePath();
    return new String[] {afterPath, beforePath};
  }

  public static int[] crossForms(Span range) {
    int minimum = range.getMax(); // violation: OppositeBoundAssigned
    return new int[] {minimum};
  }

  public static int seeded(Span range, int[] values) {
    int max = range.getMin();
    for (int value : values) {
      max = Math.max(max, value);
    }
    return max;
  }

  public static int[] suffixed(Span range) {
    int max2 = range.getMin(); // violation: OppositeBoundAssigned
    return new int[] {max2};
  }

  public static int[] transposed(Span range) {
    int x = range.y();
    int y = range.x();
    int width = range.getHeight();
    int height = range.getWidth();
    return new int[] {x, y, width, height};
  }

  public static int shift(Span range) {
    int nextIndex = range.getPreviousIndex(); // violation: OppositeBoundAssigned
    int previousIndex = range.getPreviousIndex();
    return nextIndex + previousIndex;
  }

  public static String entry(Map.Entry<String, String> entry, Iterator<String> items, Matcher matcher) {
    String value = entry.getKey();
    String key = entry.getValue();
    String previous = items.next();
    int start = matcher.end();
    return value + key + previous + start;
  }

  public static Span walk(Span range, Span other) {
    Span previous = other;
    previous = previous.getNext(range);
    return previous;
  }

  public void assign(Span range) {
    max = range.getMin(); // violation: OppositeBoundAssigned
    this.nextIndex = range.getPreviousIndex(); // violation: OppositeBoundAssigned
    nextIndex = range.getNextIndex();
  }

  public static int[] allowed(Span range, int[] values) {
    int min = range.getMin();
    int minMaxRange = range.getMax() - range.getMin();
    int maxFrom = range.getMax();
    int clamp = Math.max(range.getMin(), values[0]);
    int least = Math.min(range.getMax(), values[1]);
    int max = Math.max(range.getMax(), values[0]);
    int minimum = Math.max(range.getMin(), values[1]);
    int toTarget = range.getMax();
    int source = range.getMin();
    int span = range.getWidth();
    return new int[] {min, minMaxRange, maxFrom, clamp, least, max, minimum, toTarget, source, span};
  }
}
