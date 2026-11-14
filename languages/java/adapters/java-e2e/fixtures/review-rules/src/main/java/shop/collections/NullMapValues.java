package shop.collections;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collector;
import java.util.stream.Collectors;
import org.springframework.lang.Nullable;

public final class NullMapValues {
  public record Item(String id, @Nullable String note, String group) {}

  public static final class Row {
    private final String owner;

    public Row(String owner) {
      this.owner = owner;
    }

    @Nullable
    public String getOwner() {
      return owner;
    }

    public String getId() {
      return owner + "-id";
    }
  }

  private final Map<String, String> labels;

  public NullMapValues(Map<String, String> labels) {
    this.labels = new LinkedHashMap<>(labels);
  }

  private static <T, K, V> Collector<T, ?, Map<K, V>> toLinkedHashMap(
      Function<T, K> keyFunction, Function<T, V> valueFunction) {
    return Collectors.toMap(keyFunction, valueFunction, (first, second) -> second, LinkedHashMap::new);
  }

  public Map<String, String> fromInfo(Map<String, ?> info) {
    return info.entrySet().stream()
        .collect(toLinkedHashMap(Map.Entry::getKey, Map.Entry::getValue)); // violation: NullMapValue
  }

  public Map<String, Object> fromPayload(Map<String, Object> payload) {
    return payload.entrySet().stream()
        .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue())); // violation: NullMapValue
  }

  public Map<String, @Nullable String> fromNullableValues(Map<String, @Nullable String> values) {
    return values.entrySet().stream()
        .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue)); // violation: NullMapValue
  }

  public Map<String, String> keyFiltered(Map<String, ?> info) {
    return info.entrySet().stream()
        .filter(entry -> entry.getKey() != null)
        .collect(toLinkedHashMap(Map.Entry::getKey, Map.Entry::getValue)); // violation: NullMapValue
  }

  public Map<String, String> identityStep(Map<String, ?> info) {
    return info.entrySet().stream()
        .map(entry -> entry)
        .collect(toLinkedHashMap(Map.Entry::getKey, Map.Entry::getValue)); // violation: NullMapValue
  }

  public Map<String, String> aliased(Map<String, ?> info) {
    var copy = info;
    return copy.entrySet().stream()
        .collect(toLinkedHashMap(Map.Entry::getKey, Map.Entry::getValue)); // violation: NullMapValue
  }

  public Map<String, String> cast(Map<String, Object> payload) {
    return payload.entrySet().stream()
        .collect(Collectors.toMap(Map.Entry::getKey, entry -> (String) entry.getValue())); // violation: NullMapValue
  }

  public Map<String, String> fromLabels(Map<String, String> source) {
    return source.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
  }

  public Map<String, String> ownLabels() {
    return labels.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
  }

  public Map<String, String> withoutNulls(Map<String, ?> info) {
    return info.entrySet().stream()
        .filter(entry -> entry.getValue() != null)
        .collect(toLinkedHashMap(Map.Entry::getKey, entry -> entry.getValue().toString()));
  }

  public Map<String, String> asText(Map<String, ?> info) {
    return info.entrySet().stream()
        .collect(toLinkedHashMap(Map.Entry::getKey, entry -> Objects.toString(entry.getValue())));
  }

  public Map<String, Object> kept(Map<String, Object> payload) {
    return payload.entrySet().stream()
        .collect(HashMap::new, (map, entry) -> map.put(entry.getKey(), entry.getValue()), Map::putAll);
  }

  public Map<String, String> notes(List<Item> items) {
    return items.stream().collect(Collectors.toMap(Item::id, Item::note)); // violation: NullMapValue
  }

  public Map<String, String> looked(List<Item> items) {
    return items.stream().collect(Collectors.toMap(Item::id, item -> labels.get(item.group()))); // violation: NullMapValue
  }

  public Map<String, String> fallbacks(List<Item> items) {
    return items.stream()
        .collect(Collectors.toMap(Item::id, item -> Optional.ofNullable(item.note()).orElse(null))); // violation: NullMapValue
  }

  public Map<String, String> branches(List<Item> items) {
    return items.stream()
        .collect(Collectors.toConcurrentMap(Item::id, item -> item.note() == null ? null : item.note())); // violation: NullMapValue
  }

  public Map<String, String> defaulted(List<Item> items) {
    return items.stream()
        .collect(Collectors.toMap(Item::id, item -> Optional.ofNullable(item.note()).orElse("none")));
  }

  public Map<String, List<Row>> byOwner(List<Row> rows) {
    return rows.stream().collect(Collectors.groupingBy(Row::getOwner)); // violation: NullMapValue
  }

  public Map<String, List<Row>> byId(List<Row> rows) {
    return rows.stream().collect(Collectors.groupingBy(Row::getId));
  }
}
