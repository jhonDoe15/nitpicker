package e;

import static org.junit.Assert.assertThrows;

import com.google.common.collect.ImmutableList;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Supplier;
import org.junit.Test;

public class F45Am1 {
  static final int LIMIT = 3;
  List<String> names = new ArrayList<>();

  static class Builder {
    Builder setBar(Object bar) { return this; }
    Builder setAll(String... values) { return this; }
    Object build() { return null; }
  }

  static Builder builder() { return new Builder(); }
  static int checked() throws IOException { return 1; }
  static int other() throws java.sql.SQLException { return 2; }
  static int unchecked() { return 0; }
  static Object make() { return null; }
  void consume(int i) {}
  void consume2(int i, Object o) {}
  void take(Runnable r) {}
  void takeList(List<String> list) {}

  @Test
  public void receiver() {
    assertThrows(IllegalStateException.class, () -> builder().build());
  }

  @Test
  public void argument() {
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  @Test
  public void block() {
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> { b.setBar(make()); });
  }

  @Test
  public void assigned() {
    Builder b = builder();
    IllegalStateException e = assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  @Test
  public void varargs() {
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> b.setAll("a", String.valueOf(make()), make().toString()));
  }

  @Test
  public void constants() {
    assertThrows(IllegalStateException.class, () -> consume(LIMIT + 1));
    assertThrows(IllegalStateException.class, () -> consume(unchecked()));
    assertThrows(IllegalStateException.class, () -> takeList(names));
    assertThrows(IllegalStateException.class, () -> takeList(this.names));
    assertThrows(IllegalStateException.class, () -> takeList(Arrays.asList("a")));
    assertThrows(IllegalStateException.class, () -> takeList(ImmutableList.of("a", "b")));
    assertThrows(IllegalStateException.class, () -> takeList(Collections.emptyList()));
    assertThrows(IllegalStateException.class, () -> takeList(Arrays.asList(String.valueOf(make()))));
  }

  @Test
  public void checkedExpectation() throws Exception {
    assertThrows(IOException.class, () -> consume(unchecked()));
    assertThrows(IOException.class, () -> consume(checked()));
    assertThrows(java.io.FileNotFoundException.class, () -> consume(checked()));
    assertThrows(Exception.class, () -> consume(unchecked()));
  }

  @Test
  public void needsThrows() {
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> consume(checked()));
  }

  @Test
  public void needsThrowsOther() throws IOException {
    assertThrows(IllegalStateException.class, () -> consume(checked()));
    assertThrows(IllegalStateException.class, () -> consume(other()));
  }

  @Test
  public void lambdasAndRefs() {
    assertThrows(IllegalStateException.class, () -> take(() -> make()));
    assertThrows(IllegalStateException.class, () -> take(F45Am1::make));
    assertThrows(IllegalStateException.class, () -> take(builder()::build));
    assertThrows(IllegalStateException.class, () -> take(new Runnable() { public void run() {} }));
    assertThrows(IllegalStateException.class, () -> take(new Runnable() { int x = 1; public void run() {} }));
    assertThrows(IllegalStateException.class, () -> consume2(1, new Object()));
    assertThrows(IllegalStateException.class, () -> consume2(1, new int[] {1, 2}));
    assertThrows(IllegalStateException.class, () -> consume2(1, new int[] {unchecked()}));
    assertThrows(IllegalStateException.class, () -> consume2(1, (Object) "x"));
    assertThrows(IllegalStateException.class, () -> takeList((List<String>) make()));
  }

  @Test
  public void names() {
    int bar = 1;
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> b.setBar(make()));
    assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  @Test
  public void notMatched() {
    Builder b = builder();
    assertThrows(IllegalStateException.class, () -> { b.setBar(make()); b.build(); });
    assertThrows(IllegalStateException.class, b::build);
    take(() -> assertThrows(IllegalStateException.class, () -> b.setBar(make())));
    Object o = (Object) assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  public void returned(Builder b) {
    if (b != null) {
      return;
    }
    Runnable r = () -> {
      assertThrows(IllegalStateException.class, () -> b.setBar(make()));
    };
  }

  IllegalStateException ret(Builder b) {
    return assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  void inner() {
    Runnable r = new Runnable() {
      public void run() {
        Builder b = builder();
        assertThrows(IllegalStateException.class, () -> b.setBar(make()));
      }
    };
  }

  @SuppressWarnings("AssertThrowsMinimizer")
  void suppressed(Builder b) {
    assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  void partlySuppressed(Builder b) {
    Runnable r = new Runnable() {
      @SuppressWarnings("AssertThrowsMinimizer")
      public void run() {
        assertThrows(IllegalStateException.class, () -> b.setBar(make()));
      }
    };
    assertThrows(IllegalStateException.class, () -> b.setBar(make()));
  }

  void withThrows(Builder b) throws IOException, java.sql.SQLException {
    assertThrows(IllegalStateException.class, () -> consume(other()));
  }

  void throwsRuntime(Builder b) throws RuntimeException {
    assertThrows(IllegalStateException.class, () -> consume(checked()));
  }

  void staticCall() {
    assertThrows(IllegalStateException.class, () -> F45Am1.builder().build());
    assertThrows(IllegalStateException.class, () -> String.valueOf(make()));
    assertThrows(IllegalStateException.class, () -> Integer.parseInt(String.valueOf(make())));
    assertThrows(IllegalStateException.class, () -> new ArrayList<Object>().add(make()));
    Supplier<Object> s = () -> null;
    assertThrows(IllegalStateException.class, () -> s.get().hashCode());
  }
}
