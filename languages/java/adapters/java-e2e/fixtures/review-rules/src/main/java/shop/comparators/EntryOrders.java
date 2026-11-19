package shop.comparators;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.TreeSet;

public class EntryOrders {

  public static final class ByModified implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return (int) (a.modified() - b.modified()); // violation: SubtractionComparison
    }
  }

  public static final class ByCount implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return a.count() - b.count(); // violation: SubtractionComparison
    }
  }

  public static final class ByWeight implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return (int) (a.weight() - b.weight()); // violation: SubtractionComparison
    }
  }

  public static final class ByModifiedSafe implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return Long.compare(a.modified(), b.modified());
    }
  }

  public static final class ByGrade implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return a.grade() - b.grade();
    }
  }

  public static final class ByLevel implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return a.level() - b.level();
    }
  }

  public static final class ByNameLength implements Comparator<Entry> {
    @Override
    public int compare(Entry a, Entry b) {
      return a.name().length() - b.name().length();
    }
  }

  public static final class BySize implements Comparator<List<String>> {
    @Override
    public int compare(List<String> a, List<String> b) {
      return a.size() - b.size();
    }
  }

  public static final class ByRemaining implements Comparator<ByteBuffer> {
    @Override
    public int compare(ByteBuffer a, ByteBuffer b) {
      return a.remaining() - b.remaining();
    }
  }

  public static final class ByBoxed implements Comparator<Integer> {
    @Override
    public int compare(Integer a, Integer b) {
      return a - b;
    }
  }

  public static final class ByRank implements Comparator<Entry> {
    private final int base = 3;

    @Override
    public int compare(Entry a, Entry b) {
      return base > 0 ? a.count() - b.count() : 0; // violation: SubtractionComparison
    }
  }

  public static int spread(Entry a, Entry b) {
    return a.count() - b.count();
  }

  public static void sort(List<Entry> source) {
    List<Entry> entries = new ArrayList<>(source);
    Comparator<Entry> byCount = (a, b) -> a.count() - b.count(); // violation: SubtractionComparison
    Comparator<Entry> byTime = (a, b) -> (int) (a.modified() - b.modified()); // violation: SubtractionComparison
    Comparator<Entry> byGrade = (a, b) -> a.grade() - b.grade();
    Comparator<Entry> byLevel = (a, b) -> {
      int diff = a.level() - b.level();
      return diff;
    };
    Comparator<Entry> byWeight = (a, b) -> {
      return (int) (a.weight() - b.weight()); // violation: SubtractionComparison
    };
    Comparator<Entry> ternary = (x, y) -> x.count() < y.count() ? -1 : x.count() - y.count(); // violation: SubtractionComparison
    Comparator<Entry> safe = Comparator.comparingInt(Entry::count);
    entries.sort(byCount.thenComparing(byTime).thenComparing(byGrade).thenComparing(byLevel).thenComparing(byWeight).thenComparing(ternary).thenComparing(safe));
    entries.sort((a, b) -> b.count() - a.count()); // violation: SubtractionComparison
    TreeSet<Entry> tree = new TreeSet<>((a, b) -> a.count() - b.count()); // violation: SubtractionComparison
    PriorityQueue<Entry> queue = new PriorityQueue<>((a, b) -> Integer.compare(a.count(), b.count()));
    tree.addAll(queue);
  }

  public static int total(List<Entry> entries) {
    return entries.stream().map(Entry::count).reduce((a, b) -> a - b).orElse(0);
  }
}
