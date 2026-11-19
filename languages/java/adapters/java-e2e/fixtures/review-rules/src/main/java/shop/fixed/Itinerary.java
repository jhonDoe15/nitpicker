package shop.fixed;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Itinerary {
  private final List<String> stops;
  private final Map<String, Integer> distances;
  private final List<String> labels;
  private final List<String> history;

  public Itinerary() {
    this.stops = new ArrayList<>();
    this.distances = new LinkedHashMap<>();
    this.labels = List.of("trip");
    this.history = new ArrayList<>();
  }

  public Itinerary(Itinerary other) {
    this.stops = other.stops; // violation: CopyConstructorSharesCollection
    this.distances = new LinkedHashMap<>(other.distances);
    this.labels = other.labels;
    this.history = other.getHistory(); // violation: CopyConstructorSharesCollection
  }

  public void addStop(String stop, int distance) {
    stops.add(stop);
    distances.put(stop, distance);
    history.add("added " + stop);
  }

  public List<String> getHistory() {
    return Collections.unmodifiableList(history);
  }

  public List<String> getLabels() {
    return labels;
  }

  public int total() {
    return distances.values().stream().mapToInt(Integer::intValue).sum() + stops.size();
  }

  public static final class RouteBuilder {
    private final List<String> parts;

    public RouteBuilder() {
      this.parts = new ArrayList<>();
    }

    public RouteBuilder(RouteBuilder parent) {
      this.parts = parent.parts;
    }

    public RouteBuilder part(String part) {
      parts.add(part);
      return this;
    }
  }

  public static final class Tagged {
    private List<String> tags;

    public Tagged() {
      this.tags = new ArrayList<>();
      this.tags.add("new");
    }

    public Tagged(Tagged other) {
      this.tags = other.tags;
      this.tags.size();
    }

    public Tagged with(String tag) {
      tags = new ArrayList<>(tags);
      tags.add(tag);
      return this;
    }

    public Tagged copyWith(String tag) {
      Tagged copy = new Tagged();
      copy.tags = new ArrayList<>(tags);
      copy.tags.add(tag);
      return copy;
    }
  }
}
