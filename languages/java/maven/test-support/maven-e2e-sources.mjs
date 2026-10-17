export const DATED = `package demo;

import java.util.Date;

public class Dated {
    public Date now(int a, int b, int c, int d) {
        if (a > 0) { if (b > 0) { if (c > 0) { if (d > 0) { return new Date(); } } } }
        try { Integer.parseInt("x"); } catch (NumberFormatException e) { }
        return new Date(new String(new byte[] {1}).length());
    }

    public String shout(String text) {
        if (text.isEmpty()) return text;
        return text.toUpperCase();
    }
}
`;

export const EMPTY_CATCH = `package demo.app;

public final class Parser {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;

export const FAILING_TEST = `package demo.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AdderTest {
  @Test
  void adds() {
    assertEquals(4, new Adder().add(1, 2));
  }
}
`;
