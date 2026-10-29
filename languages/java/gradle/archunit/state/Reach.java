import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

final class Reach {
  static final class Sink implements Comparable<Sink> {
    final String owner;
    final String field;
    final String op;
    final boolean onReceiver;
    private final String key;

    Sink(String owner, String field, String op, boolean onReceiver) {
      this.owner = owner;
      this.field = field;
      this.op = op;
      this.onReceiver = onReceiver;
      this.key = owner + "|" + field + "|" + op + "|" + onReceiver;
    }

    @Override
    public int compareTo(Sink other) {
      return key.compareTo(other.key);
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof Sink && key.equals(((Sink) other).key);
    }

    @Override
    public int hashCode() {
      return key.hashCode();
    }

    @Override
    public String toString() {
      return key;
    }
  }

  final Set<Sink> sinks = new TreeSet<>();
  final Set<Integer> retains = new TreeSet<>();

  @Override
  public boolean equals(Object other) {
    return other instanceof Reach && sinks.equals(((Reach) other).sinks) && retains.equals(((Reach) other).retains);
  }

  @Override
  public int hashCode() {
    return Objects.hash(sinks, retains);
  }
}
