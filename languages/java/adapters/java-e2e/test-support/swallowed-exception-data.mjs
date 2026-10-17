export const LOOKUP = `package shop;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

public class Lookup {
  private static final int DEFAULT_PORT = 80;
  private static final Logger log = Logger.getLogger("lookup");
  private final List<String> errors = new ArrayList<>();
  private Throwable lastError;
  private boolean present;
  private String label;
  private int failures;

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

  public int portOrDefault(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return DEFAULT_PORT;
    }
  }

  public int logAndReturn(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.warning("not a number");
      return -1;
    }
  }

  public void logOnly(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.log(Level.WARNING, "not a number", e);
    }
  }

  public int nested(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      if (text == null) {
        return 0;
      }
      return 1;
    }
  }

  public boolean isNumber(String text) {
    try {
      Integer.parseInt(text);
      return true;
    } catch (NumberFormatException e) {
      return false;
    }
  }

  public void count(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      failures++;
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

  public boolean exists(String name) {
    try {
      Class.forName(name);
      return true;
    } catch (ClassNotFoundException e) {
      return false;
    }
  }

  public boolean present() {
    return present;
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

  public int portOrLogAndRethrow(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.log(Level.WARNING, "not a number", e);
      throw e;
    }
  }

  public Optional<Integer> portOrFailure(String text) {
    try {
      return Optional.of(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return Optional.of(describe(e));
    }
  }

  public void collect(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      errors.add(e.getMessage());
    }
  }

  public void keep(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      lastError = e;
    }
  }

  public void pause() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  public int firstNumber(List<String> items) {
    for (String item : items) {
      try {
        return Integer.parseInt(item);
      } catch (NumberFormatException e) {
        break;
      }
    }
    return 0;
  }

  public List<String> errors() {
    return errors;
  }

  public Throwable lastError() {
    return lastError;
  }

  private int describe(Throwable error) {
    return error.getMessage().length();
  }
}
`;

export const FLAGGED_LOOKUP_METHODS = [
  'port',
  'label',
  'parse',
  'split',
  'words',
  'total',
  'remember',
  'portOrDefault',
  'logAndReturn',
  'logOnly',
  'nested',
  'isNumber',
  'count',
];

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
    assertEquals(Optional.empty(), lookup.parse("x"));
    assertEquals(Optional.of(3), lookup.parse("3"));
    assertEquals(Optional.of(0), lookup.portOrFailure("x"));
    assertThrows(IllegalArgumentException.class, () -> lookup.portOrWrap("x"));
    assertThrows(NumberFormatException.class, () -> lookup.portOrLogAndRethrow("x"));
    assertEquals(-1, lookup.logAndReturn("x"));
    lookup.logOnly("x");
    assertEquals(0, lookup.nested(null));
    assertEquals(1, lookup.nested("x"));
    assertFalse(lookup.isNumber("x"));
    assertTrue(lookup.isNumber("1"));
    lookup.count("x");
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
    assertTrue(lookup.exists("shop.Lookup"));
    assertFalse(lookup.exists("shop.Missing"));
  }

  @Test
  void keepsTheErrors() {
    lookup.collect("x");
    lookup.keep("x");
    lookup.pause();
    assertEquals(1, lookup.firstNumber(List.of("1", "x")));
    assertEquals(0, lookup.firstNumber(List.of("x", "1")));
    assertEquals(1, lookup.errors().size());
    assertEquals(NumberFormatException.class, lookup.lastError().getClass());
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
