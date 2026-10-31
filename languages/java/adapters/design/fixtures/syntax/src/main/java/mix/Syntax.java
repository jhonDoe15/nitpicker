package mix;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

public class Syntax {
  private final List<String> names = new ArrayList<>();
  private int[] counts = new int[4];
  private String title = "t";

  static {
    System.out.println("loaded");
  }

  public sealed interface Node permits Leaf, Branch {}

  public record Leaf(String value) implements Node {
    public Leaf {
      if (value == null) {
        throw new IllegalArgumentException();
      }
    }
  }

  public record Branch(Node left, Node right) implements Node {}

  public enum Mode {
    FAST {
      @Override
      int speed() {
        return 2;
      }
    },
    SLOW {
      @Override
      int speed() {
        return 1;
      }
    };

    abstract int speed();
  }

  public interface Visitor<T> {
    T visit(Node node);

    private int hidden() {
      return 0;
    }
  }

  public <T extends Node> T pick(List<? extends T> nodes, T... more) {
    return nodes.get(0);
  }

  public void anonymous(Leaf leaf) {
    Runnable task =
        new Runnable() {
          @Override
          public void run() {
            names.add(leaf.value());
            title = "x";
          }
        };
    task.run();
  }

  public void local(Leaf leaf) {
    class Helper {
      String go() {
        return leaf.value();
      }
    }
    new Helper().go();
  }

  public String lambdas(List<Leaf> leaves) {
    Function<Leaf, String> read = item -> item.value();
    leaves.forEach(item -> names.add(item.value()));
    return leaves.stream().map(Leaf::value).findFirst().orElse(read.apply(null));
  }

  public int patterns(Node node) {
    if (node instanceof Leaf leaf && leaf.value() != null) {
      return leaf.value().length();
    }
    return switch (node) {
      case Leaf leaf -> 1;
      case Branch branch -> patterns(branch.left()) + patterns(branch.right());
    };
  }

  public int labeled() {
    int total = 0;
    outer:
    for (int index = 0; index < counts.length; index++) {
      for (int other = 0; other < 3; other++) {
        if (other == 2) {
          continue outer;
        }
        total += counts[index]++;
      }
    }
    String block =
        """
        text
        """;
    return total + block.length();
  }

  public String[] array(String... values) {
    String[] copy = values.clone();
    counts[0] = 3;
    return copy;
  }

  public Object generic(Mode mode, Visitor<String> visitor) {
    return mode.speed() + visitor.visit(null);
  }
}
