package nitpicker.kotlinpsi.design.walk;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.model.Kinds;
import nitpicker.kotlinpsi.design.model.Owner;

public final class Reads {
  private static final class Read {
    public final Owner type;
    public final Set<String> fields = new LinkedHashSet<>();
    public final Set<String> decided = new LinkedHashSet<>();
    public final int line;

    public Read(Owner type, int line) {
      this.type = type;
      this.line = line;
    }
  }

  public record Access(String field, boolean decided, int line) {}

  private final Map<Object, Read> byValue = new IdentityHashMap<>();
  private final List<Read> order = new ArrayList<>();

  public void record(Object value, Owner type, Access access) {
    if (type == null || !type.listed || !Kinds.valueLike(type)) {
      return;
    }
    Read read = byValue.get(value);
    if (read == null) {
      read = new Read(type, access.line());
      byValue.put(value, read);
      order.add(read);
    }
    read.fields.add(access.field());
    if (access.decided()) {
      read.decided.add(access.field());
    }
  }

  public List<Object> facts() {
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
