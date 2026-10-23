import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

final class Reach {
  static final class Sink implements Comparable<Sink> {
    final String owner;
    final String field;
    final String op;

    Sink(String owner, String field, String op) {
      this.owner = owner;
      this.field = field;
      this.op = op;
    }

    @Override
    public int compareTo(Sink other) {
      return toString().compareTo(other.toString());
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof Sink && toString().equals(other.toString());
    }

    @Override
    public int hashCode() {
      return toString().hashCode();
    }

    @Override
    public String toString() {
      return owner + "|" + field + "|" + op;
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
