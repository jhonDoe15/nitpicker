package nitpicker.kotlinpsi.bodies;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;

final class ScopeTable {
  private final Map<Frame, Integer> ids = new IdentityHashMap<>();
  private final Map<Frame, Map<String, Object>> details = new IdentityHashMap<>();
  private final List<Frame> frames = new ArrayList<>();

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
    id(frame.parent);
    int id = frames.size();
    ids.put(frame, id);
    frames.add(frame);
    return id;
  }

  List<Object> entries() {
    List<Object> entries = new ArrayList<>();
    for (Frame frame : frames) {
      Integer parent = frame.parent == null ? null : ids.get(frame.parent);
      Map<String, Object> entry = m("id", ids.get(frame), "parent", parent);
      for (Map.Entry<String, Object> pair : frame.data.entrySet()) {
        if (!"supers".equals(pair.getKey())) {
          entry.put(pair.getKey(), pair.getValue());
        }
      }
      entry.putAll(details.getOrDefault(frame, Map.of()));
      entries.add(entry);
    }
    return entries;
  }
}
