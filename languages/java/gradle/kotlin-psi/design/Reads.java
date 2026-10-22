package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class Reads {
  private static final class Read {
    final Owner type;
    final Set<String> fields = new LinkedHashSet<>();
    final Set<String> decided = new LinkedHashSet<>();
    final int line;

    Read(Owner type, int line) {
      this.type = type;
      this.line = line;
    }
  }

  private final Map<Object, Read> byValue = new IdentityHashMap<>();
  private final List<Read> order = new ArrayList<>();

  void record(Object value, Owner type, String field, boolean decided, int line) {
    if (type == null || !type.listed || !Kinds.valueLike(type)) {
      return;
    }
    Read read = byValue.get(value);
    if (read == null) {
      read = new Read(type, line);
      byValue.put(value, read);
      order.add(read);
    }
    read.fields.add(field);
    if (decided) {
      read.decided.add(field);
    }
  }

  List<Object> facts() {
    List<Object> facts = new ArrayList<>();
    for (Read read : order) {
      facts.add(
          m(
              "type", read.type.id, "fields", new ArrayList<Object>(read.fields),
              "decided", read.decided.isEmpty() ? null : new ArrayList<Object>(read.decided), "line", read.line));
    }
    return facts;
  }
}
