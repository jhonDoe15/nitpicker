export const UNITS = `package demo;

import java.util.List;
import java.util.function.Function;

public final class Units {
  static final Function<Integer, String> LABEL =
      value -> {
        if (value > 100) {
          return "huge";
        }
        if (value > 50) {
          return "big";
        }
        if (value > 10) {
          return "mid";
        }
        if (value > 5) {
          return "small";
        }
        return "tiny";
      };

  static final int[] TABLE;

  static {
    int[] table = new int[3];
    for (int i = 0; i < table.length; i++) {
      table[i] = i % 2 == 0 && i > 0 ? i : -i;
    }
    TABLE = table;
  }

  private final int[] copy = new int[3];

  {
    for (int i = 0; i < copy.length; i++) {
      copy[i] = i % 2 == 0 && i > 0 ? TABLE[i] : -i;
    }
  }

  public int total(List<Integer> values) {
    return values.stream()
        .map(v -> v > 3 && v < 9 ? v : 0)
        .mapToInt(Integer::intValue)
        .sum();
  }

  public static String label(int value) {
    return LABEL.apply(value);
  }
}
`;

export const UNITS_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class UnitsTest {
  @Test
  void labelsEveryTier() {
    assertEquals("huge", Units.label(200));
    assertEquals("big", Units.label(60));
    assertEquals("mid", Units.label(20));
    assertEquals("small", Units.label(7));
    assertEquals("tiny", Units.label(1));
  }
}
`;
