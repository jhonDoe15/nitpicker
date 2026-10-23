package nitpicker.kotlinpsi.common;

import java.util.*;

public final class Frame {
  public final Frame parent;
  public final Map<String, Object> data;

  public Frame(Frame parent, Map<String, Object> data) {
    this.parent = parent;
    this.data = data;
  }

  public Object kind() {
    return data.get("k");
  }

  public Frame nearest(String kind) {
    for (Frame frame = this; frame != null; frame = frame.parent) {
      if (kind.equals(frame.kind())) {
        return frame;
      }
    }
    return null;
  }

  public List<Object> chain() {
    List<Object> scopes = new ArrayList<>();
    for (Frame frame = this; frame != null; frame = frame.parent) {
      scopes.add(frame.data);
    }
    return scopes;
  }
}
