package shop.fixed;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

public final class FixedSizeLists {
  private final List<String> comments = Arrays.asList("#");
  private final List<String> tags = new ArrayList<>(List.of("new"));
  private final Map<String, String> defaults = Map.of("mode", "fast");
  private final Set<String> reserved = Collections.unmodifiableSet(new java.util.HashSet<>());
  private List<String> pending = Collections.emptyList();
  private List<String> names = Collections.emptyList();
  private final List<String> sorted = Arrays.asList("b", "a");

  public FixedSizeLists addComment(String comment) {
    comments.add(comment); // violation: ImmutableCollectionChanged
    return this;
  }

  public FixedSizeLists addTag(String tag) {
    tags.add(tag);
    return this;
  }

  public void override(String key, String value) {
    this.defaults.put(key, value); // violation: ImmutableCollectionChanged
  }

  public void reserve(String name) {
    reserved.add(name); // violation: ImmutableCollectionChanged
  }

  public void queue(String item) {
    pending.add(item); // violation: ImmutableCollectionChanged
  }

  public void rename(List<String> fresh) {
    names = fresh;
  }

  public void addName(String name) {
    names.add(name);
  }

  public List<String> sortedNames() {
    sorted.sort(null);
    sorted.set(0, "c");
    return sorted;
  }

  public int count() {
    return comments.size() + defaults.size() + reserved.size() + pending.size() + names.size();
  }

  public static List<String> collect(List<String> list) {
    List<String> result = Collections.emptyList();
    if (!list.isEmpty()) {
      result = new ArrayList<>(list);
    }
    result.add("end");
    return result;
  }

  public static List<String> withDefault(String extra) {
    List<String> result = Collections.emptyList();
    result.add(extra); // violation: ImmutableCollectionChanged
    return result;
  }

  public static List<String> fromStream(Stream<String> source, String extra) {
    List<String> result = source.toList();
    result.add(extra); // violation: ImmutableCollectionChanged
    return result;
  }

  public static Map<String, String> merged(String key) {
    Map<String, String> result = Map.of("a", "b");
    result.put(key, "v"); // violation: ImmutableCollectionChanged
    return result;
  }

  public static List<String> copied(String extra) {
    List<String> result = new ArrayList<>(List.of("a"));
    result.add(extra);
    return result;
  }

  public static List<String> replaced(String extra) {
    List<String> result = List.of();
    result = new ArrayList<>(result);
    result.add(extra);
    return result;
  }

  public static Map<String, Integer> counts(List<String> words) {
    Map<String, Integer> counts = new HashMap<>();
    for (String word : words) {
      counts.merge(word, 1, Integer::sum);
    }
    return counts;
  }

  public static List<String> clearAfterOverwrite() {
    List<String> view = Arrays.asList("a", "b");
    view.set(0, "x");
    view.sort(null);
    return List.copyOf(view);
  }

  @interface Setter {
  }

  @Setter
  public static final class Annotated {
    private List<String> names = List.of();

    public void add(String name) {
      names.add(name);
    }
  }

  public static final class Exposed {
    List<String> names = List.of();

    public void add(String name) {
      names.add(name);
    }
  }
}
