package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import org.junit.jupiter.api.Test;

class WeakAssertionTest {
  interface Mailer {
    void send(String to, Integer copies);

    void flush();
  }

  private final List<String> items = List.of("a", "b");
  private final String text = "ab";
  private final int[] numbers = {1, 2};

  @Test
  void checksOnlyPresence() {
    assertNotNull(items); // violation: WeakAssertionInTest
    assertNotNull(items, "items"); // violation: WeakAssertionInTest
    assertThat(items).isNotNull(); // violation: WeakAssertionInTest
    assertThat(items, notNullValue()); // violation: WeakAssertionInTest
    assertThat(items, is(notNullValue())); // violation: WeakAssertionInTest
    assertThat(items, not(nullValue())); // violation: WeakAssertionInTest
  }

  @Test
  void checksOnlyThatSomethingIsThere() {
    assertTrue(items.size() > 0); // violation: WeakAssertionInTest
    assertTrue(items.size() >= 1); // violation: WeakAssertionInTest
    assertTrue(0 < items.size()); // violation: WeakAssertionInTest
    assertTrue(text.length() > 0); // violation: WeakAssertionInTest
    assertTrue(numbers.length > 0); // violation: WeakAssertionInTest
    assertFalse(items.isEmpty()); // violation: WeakAssertionInTest
    assertNotEquals(0, items.size()); // violation: WeakAssertionInTest
    assertThat(items).isNotEmpty(); // violation: WeakAssertionInTest
    assertThat(text).isNotBlank(); // violation: WeakAssertionInTest
    assertThat(items).hasSizeGreaterThan(0); // violation: WeakAssertionInTest
    assertThat(items).hasSizeGreaterThanOrEqualTo(1); // violation: WeakAssertionInTest
    assertThat(items.size()).isPositive(); // violation: WeakAssertionInTest
    assertThat(items.size()).isNotZero(); // violation: WeakAssertionInTest
    assertThat(items.size()).isGreaterThan(0); // violation: WeakAssertionInTest
    assertThat(items, not(empty())); // violation: WeakAssertionInTest
    assertThat(text, not(emptyString())); // violation: WeakAssertionInTest
    assertThat(items, is(not(empty()))); // violation: WeakAssertionInTest
  }

  @Test
  void verifiesOnlyThatAMockWasCalled() {
    Mailer mailer = mock(Mailer.class);
    mailer.send("a", 1);
    verify(mailer).send(any(), anyInt()); // violation: WeakAssertionInTest
    verify(mailer, times(1)).send(anyString(), any(Integer.class)); // violation: WeakAssertionInTest
    verify(mailer, atLeastOnce()).send(any(), any()); // violation: WeakAssertionInTest
    then(mailer).should().send(any(), anyInt()); // violation: WeakAssertionInTest
  }

  @Test
  void assertsTheValue() {
    assertEquals(List.of("a", "b"), items);
    assertThat(items).isNotNull().containsExactly("a", "b");
    assertThat(items).isNotEmpty().hasSize(2);
    assertThat(items).hasSize(2);
    assertThat(items).hasSizeGreaterThan(1);
    assertThat(items.size()).isEqualTo(2);
    assertThat(items.size()).isGreaterThan(1);
    assertThat(items, hasSize(2));
    assertThat(items, equalTo(List.of("a", "b")));
    assertTrue(items.size() > 1);
    assertTrue(items.size() >= 2);
    assertTrue(items.size() != 0);
    assertTrue(0 != items.size());
    assertTrue(items != null);
    assertTrue(!items.isEmpty());
    assertTrue(items.contains("a"));
    assertNotEquals(1, items.size());
    assertFalse(items.contains("c"));
  }

  @Test
  void verifiesTheArguments() {
    Mailer mailer = mock(Mailer.class);
    mailer.send("a", 1);
    mailer.flush();
    verify(mailer).send("a", 1);
    verify(mailer).send(eq("a"), anyInt());
    verify(mailer, times(1)).send(any(), eq(1));
    verify(mailer).flush();
    Mailer idle = mock(Mailer.class);
    verify(idle, never()).send(any(), anyInt());
    verify(idle, times(0)).send(anyString(), anyInt());
    then(idle).should(never()).send(any(), anyInt());
  }
}
