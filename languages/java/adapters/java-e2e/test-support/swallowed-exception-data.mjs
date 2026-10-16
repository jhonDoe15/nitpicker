export const LOOKUP = `package shop;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

public class Lookup {
  private static final int DEFAULT_PORT = 80;
  private boolean present;
  private String label;

  public int port(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return -1;
    }
  }

  public String label(String text) {
    try {
      return text.trim();
    } catch (NullPointerException e) {
      return null;
    }
  }

  public Optional<Integer> parse(String text) {
    try {
      return Optional.of(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return Optional.empty();
    }
  }

  public List<String> split(String text) {
    try {
      return List.of(text.split(","));
    } catch (NullPointerException e) {
      return Collections.emptyList();
    }
  }

  public List<String> words(String text) {
    try {
      return List.of(text.split(" "));
    } catch (NullPointerException e) {
      return new ArrayList<>();
    }
  }

  public int total(List<String> items) {
    int total = 0;
    for (String item : items) {
      try {
        total += Integer.parseInt(item);
      } catch (NumberFormatException e) {
        continue;
      }
    }
    return total;
  }

  public void remember(String text) {
    try {
      label = text.trim();
    } catch (NullPointerException e) {
      label = "none";
    }
  }

  public void check(String name) {
    try {
      Class.forName(name);
      present = true;
    } catch (ClassNotFoundException e) {
      present = false;
    }
  }

  public boolean present() {
    return present;
  }

  public int portOrDefault(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return DEFAULT_PORT;
    }
  }

  public int portOrLength(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return text.length();
    }
  }

  public int portOrWrap(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException(text, e);
    }
  }

  public Optional<Integer> parseOrFallback(String text) {
    try {
      return Optional.of(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return Optional.of(DEFAULT_PORT);
    }
  }
}
`;

export const LOOKUP_TEST = `package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LookupTest {
  private final Lookup lookup = new Lookup();

  @Test
  void parses() {
    assertEquals(8, lookup.port("8"));
    assertEquals(-1, lookup.port("x"));
    assertEquals(80, lookup.portOrDefault("x"));
    assertEquals(1, lookup.portOrLength("x"));
    assertEquals(Optional.of(80), lookup.parseOrFallback("x"));
    assertEquals(Optional.empty(), lookup.parse("x"));
    assertEquals(Optional.of(3), lookup.parse("3"));
    assertThrows(IllegalArgumentException.class, () -> lookup.portOrWrap("x"));
  }

  @Test
  void fallsBack() {
    assertEquals("a", lookup.label(" a "));
    assertNull(lookup.label(null));
    assertEquals(List.of("a", "b"), lookup.split("a,b"));
    assertEquals(List.of(), lookup.split(null));
    assertEquals(List.of("a", "b"), lookup.words("a b"));
    assertEquals(List.of(), lookup.words(null));
    assertEquals(3, lookup.total(List.of("1", "x", "2")));
    lookup.remember(null);
    lookup.remember(" a ");
    lookup.check("shop.Lookup");
    assertTrue(lookup.present());
    lookup.check("shop.Missing");
    assertFalse(lookup.present());
  }

  @Test
  void ignoresTheError() {
    try {
      lookup.portOrWrap("x");
    } catch (IllegalArgumentException e) {
      return;
    }
    assertTrue(false);
  }
}
`;
