package e;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;

class B7Equality {
  void lookups(Map<Date, String> dates, Map<String, Queue<String>> queues, List<Collection<String>> lists, Set<CharSequence> chars, Collection<Future<String>> futures, TreeSet<Date> sorted, SortedMap<Date, String> map) {
    dates.get(null);
    dates.containsKey(new Date());
    queues.containsValue(new LinkedList<String>());
    lists.contains(new ArrayList<String>());
    chars.remove("a");
    futures.contains(new CompletableFuture<String>());
    sorted.contains(new Date());
    map.get(new Date());
    Set<Iterable<String>> iterables = new HashSet<>();
    iterables.contains(new ArrayList<String>());
    List<String> strings = new ArrayList<>();
    strings.contains("x");
    strings.removeAll(lists);
    lists.containsAll(strings);
    Collection<Date> dateCollection = new ArrayList<>();
    strings.retainAll(dateCollection);
    Collections.disjoint(strings, dateCollection);
    new IdentityHashMap<Date, String>().get(new Date());
    Map<String, Date> values = new HashMap<>();
    values.containsValue(new Date());
    values.getOrDefault("a", new Date());
    values.remove("a");
    Map<?, ?> wild = values;
    wild.get(new Date());
    Vector<Date> vector = new Vector<>();
    vector.indexOf(new Date(), 0);
  }

  @SuppressWarnings("CollectionUndefinedEquality")
  boolean suppressed(List<Date> dates) {
    return dates.contains(new Date());
  }
}
