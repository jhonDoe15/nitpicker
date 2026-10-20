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
    assertEquals(Optional.of(21), lookup.portOrFailure("x"));
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
