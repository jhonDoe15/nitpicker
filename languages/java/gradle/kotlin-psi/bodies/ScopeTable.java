package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;

final class ScopeTable {
  private final Map<Frame, Integer> ids = new IdentityHashMap<>();
  private final Map<Frame, Map<String, Object>> details = new IdentityHashMap<>();
  private final List<Object> entries = new ArrayList<>();

  void describe(Frame frame, Map<String, Object> detail) {
    details.computeIfAbsent(frame, key -> new LinkedHashMap<>()).putAll(detail);
  }

  Integer id(Frame frame) {
    if (frame == null) {
      return null;
    }
    Integer known = ids.get(frame);
    if (known != null) {
      return known;
    }
    Integer parent = id(frame.parent);
    int id = entries.size();
    ids.put(frame, id);
    Map<String, Object> entry = m("id", id, "parent", parent);
    for (Map.Entry<String, Object> pair : frame.data.entrySet()) {
      if (!"supers".equals(pair.getKey())) {
        entry.put(pair.getKey(), pair.getValue());
      }
    }
    entry.putAll(details.getOrDefault(frame, Map.of()));
    entries.add(entry);
    return id;
  }

  List<Object> entries() {
    return entries;
  }
}
