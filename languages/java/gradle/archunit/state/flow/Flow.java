import java.util.Collections;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.objectweb.asm.tree.analysis.Value;

final class Flow implements Value {
  static final String SELF = "self";
  static final String ARG = "arg:";
  static final String FIELD = "field:";
  static final String STATIC = "static:";
  static final String NEW = "new:";
  static final String LAMBDA = "lambda:";
  static final String SOURCE = "source:";
  static final Flow SINGLE = new Flow(1, Set.of(), Set.of());
  static final Flow DOUBLE = new Flow(2, Set.of(), Set.of());

  final int size;
  final Set<String> taint;
  final Set<String> alias;

  Flow(int size, Set<String> taint, Set<String> alias) {
    this.size = size;
    this.taint = Collections.unmodifiableSet(new TreeSet<>(taint));
    this.alias = Collections.unmodifiableSet(new TreeSet<>(alias));
  }

  static Flow of(int size) {
    return size == 2 ? DOUBLE : SINGLE;
  }

  static Flow tainted(int size, Set<String> taint) {
    return new Flow(size, taint, Set.of());
  }

  Flow merge(Flow other) {
    if (size != other.size) {
      return SINGLE;
    }
    if (other.taint.equals(taint) && other.alias.equals(alias)) {
      return this;
    }
    Set<String> mergedTaint = new TreeSet<>(taint);
    mergedTaint.addAll(other.taint);
    Set<String> mergedAlias = new TreeSet<>(alias);
    mergedAlias.addAll(other.alias);
    return new Flow(size, mergedTaint, mergedAlias);
  }

  @Override
  public int getSize() {
    return size;
  }

  @Override
  public boolean equals(Object other) {
    if (!(other instanceof Flow)) {
      return false;
    }
    Flow flow = (Flow) other;
    return size == flow.size && taint.equals(flow.taint) && alias.equals(flow.alias);
  }

  @Override
  public int hashCode() {
    return Objects.hash(size, taint, alias);
  }
}
