import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.objectweb.asm.tree.FieldInsnNode;

final class Aliases {
  private Aliases() {}

  static Set<String> fieldOf(Set<String> alias, String owner, String name, Predicate<String> stateful) {
    Set<String> fields = new TreeSet<>();
    boolean self = alias.contains(Flow.SELF);
    if (self) {
      fields.add(Flow.FIELD + name);
    }
    for (String id : alias) {
      if (id.startsWith(Flow.OUTER)) {
        fields.add(Flow.HELD + id.substring(Flow.OUTER.length()) + "#" + name);
      } else if (!self && !id.startsWith(Flow.NEW) && !id.startsWith(Flow.LAMBDA) && stateful.test(owner)) {
        fields.add(Flow.HELD + owner + "#" + name);
      } else if (!self) {
        fields.add(id);
      }
    }
    return fields;
  }

  static Set<String> held(
      Set<String> returns, List<? extends Flow> values, boolean instance, String owner, Predicate<String> stateful) {
    Set<String> held = new TreeSet<>();
    for (String id : returns) {
      if (id.startsWith(Flow.STATIC) || id.startsWith(Flow.HELD)) {
        held.add(id);
      } else if (id.startsWith(Flow.ARG)) {
        int index = Integer.parseInt(id.substring(Flow.ARG.length()));
        if (index < values.size()) {
          held.addAll(values.get(index).alias);
        }
      } else if (id.startsWith(Flow.FIELD) && instance && !values.isEmpty()) {
        held.addAll(fieldOf(values.get(0).alias, owner, id.substring(Flow.FIELD.length()), stateful));
      }
    }
    return held;
  }

  static boolean returnable(String id) {
    return id.startsWith(Flow.STATIC) || id.startsWith(Flow.FIELD) || id.startsWith(Flow.HELD)
        || id.startsWith(Flow.ARG);
  }

  static Set<String> taintOf(List<? extends Flow> values, int from) {
    Set<String> taint = new TreeSet<>();
    for (int position = from; position < values.size(); position++) {
      taint.addAll(values.get(position).taint);
    }
    return taint;
  }

  static Set<String> dataOf(List<? extends Flow> values) {
    Set<String> taint = new TreeSet<>();
    for (Flow value : values) {
      if (value.alias.stream().noneMatch(id -> id.startsWith(Flow.LAMBDA))) {
        taint.addAll(value.taint);
      }
    }
    return taint;
  }

  static Set<String> created(List<? extends Flow> values) {
    Set<String> created = new TreeSet<>();
    values.forEach(value -> value.alias.stream().filter(id -> id.startsWith(Flow.NEW)).forEach(created::add));
    return created;
  }

  static String staticField(FieldInsnNode field) {
    return Flow.STATIC + field.owner.substring(field.owner.lastIndexOf('/') + 1) + "." + field.name;
  }
}
