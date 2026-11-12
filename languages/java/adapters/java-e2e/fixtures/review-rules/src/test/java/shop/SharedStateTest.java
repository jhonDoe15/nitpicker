package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

class SharedStateTest {
  private static final List<Long> PRICED = new ArrayList<>();
  private static final List<Long> FIXED = List.of(1L, 2L);
  private static final List<Long> LOADED = new ArrayList<>();
  private static int calls;

  @BeforeAll
  static void loadOnce() {
    LOADED.addAll(FIXED);
  }

  @Test
  void recordsEveryPrice() {
    calls++; // violation: SharedTestState
    PRICED.add(Prices.sum(FIXED)); // violation: SharedTestState
    assertThat(PRICED).contains(3L);
  }

  @Test
  void readsTheSetUp() {
    List<Long> local = new ArrayList<>(LOADED);
    local.add(3L);
    assertThat(Prices.sum(local)).isEqualTo(6L);
  }

  @Nested
  class Totals {
    @Test
    void countsFromTheNestedClass() {
      SharedStateTest.calls += 2; // violation: SharedTestState
      assertThat(calls).isPositive();
    }
  }
}

class ResetStateTest {
  private static final List<Long> PRICED = new ArrayList<>();
  private static final AtomicInteger CALLS = new AtomicInteger();
  private static long total;

  @BeforeEach
  void startFromZero() {
    total = 0L;
    CALLS.set(0);
  }

  @AfterEach
  void forget() {
    PRICED.clear();
  }

  @Test
  void writesStateThatEveryTestResets() {
    total += Prices.sum(List.of(1L, 2L));
    CALLS.incrementAndGet();
    PRICED.add(total);
    assertThat(PRICED).containsExactly(3L);
  }
}

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SingleInstanceTest {
  private final List<Long> priced = new ArrayList<>();
  private List<Long> fresh;

  @BeforeEach
  void startEmpty() {
    fresh = new ArrayList<>();
  }

  @Test
  void collectsAcrossTests() {
    priced.add(Prices.sum(List.of(1L, 2L))); // violation: SharedTestState
    fresh.add(3L);
    assertThat(fresh).containsExactly(3L);
  }
}
