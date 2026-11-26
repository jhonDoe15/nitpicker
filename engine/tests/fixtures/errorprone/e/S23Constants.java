package e;

import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import com.google.common.base.Preconditions;
import com.google.common.truth.StandardSubjectBuilder;
import com.google.protobuf.ByteString;
import com.google.protobuf.MessageLite;
import com.google.protobuf.MessageLiteOrBuilder;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

class S23Constants {
  interface Msg extends MessageLiteOrBuilder {
    int getCount();

    String getName();

    Msg getChild();
  }

  abstract static class Bld implements MessageLite.Builder, Msg {
    abstract Bld setCount(int count);

    abstract Bld setName(String name);

    abstract Bld setOther(int other);

    abstract Bld getChildBuilder();

    abstract Bld setChild(Msg child);

    abstract Bld clearName();

    abstract int getOther();
  }

  void selfSet(Bld builder, Bld other, Msg message) {
    builder.setCount(builder.getCount());
    builder.setName(builder.getName());
    builder.setCount(other.getCount());
    builder.setCount(message.getCount());
    builder.setOther(builder.getCount());
    builder.setChild(builder.getChild());
    builder.getChildBuilder().setCount(builder.getChildBuilder().getCount());
    builder.getChildBuilder().setCount(builder.getChild().getCount());
    builder.setCount(builder.getCount() + 1);
    this.selfSet2(builder);
  }

  void selfSet2(Bld builder) {
    Bld local = builder;
    local.setCount(local.getCount());
    local = null;
  }

  @SuppressWarnings("SelfSet")
  void selfSetSuppressed(Bld builder) {
    builder.setCount(builder.getCount());
  }

  static final String CONSTANT = "x";
  static final int NUMBER = 5;
  String instance = "y";
  final String finalInstance = "z";

  String field() {
    return CONSTANT;
  }

  void truth(String actual, Object value) {
    assertThat(1).isEqualTo(actual);
    assertThat("x").isEqualTo(actual);
    assertThat("x").isNotEqualTo(actual);
    assertThat(CONSTANT).isEqualTo(actual);
    assertThat(NUMBER).isEqualTo(value);
    assertThat(S23Constants.CONSTANT).isEqualTo(actual);
    assertThat(CONSTANT).isEqualTo("y");
    assertThat(actual).isEqualTo("x");
    assertThat(instance).isEqualTo(actual);
    assertThat(finalInstance).isEqualTo(actual);
    assertThat(this).isEqualTo(actual);
    assertThat("a".length()).isEqualTo(actual.length());
    assertThat(field()).isEqualTo(actual);
    assertThat(Optional.empty()).isEqualTo(value);
    assertThat(true).isEqualTo(value);
    assertThat('c').isEqualTo(value);
    assertThat(-1).isEqualTo(value);
    assertThat(1 == 1).isEqualTo(value);
  }

  @SuppressWarnings("TruthConstantAsserts")
  void truthSuppressed(String actual) {
    assertThat("x").isEqualTo(actual);
  }

  void duplicates(List<Integer> list, Iterator<Object> it, Object o, String s, StandardSubjectBuilder builder) {
    assertThat(list).isEqualTo(1);
    assertThat(list).isEqualTo(1);
    assertThat(list).isEqualTo(2);
    assertThat(it.next()).isEqualTo(1);
    assertThat(it.next()).isEqualTo(1);
    assertEquals(1, it.next());
    assertEquals(1, it.next());
    assertEquals("message", 1, list);
    assertEquals("message", 1, list);
    assertEquals(1, list);
    assertNotEquals(1, list);
    assertNotEquals(1, list);
    Preconditions.checkNotNull(o);
    Preconditions.checkNotNull(o);
    Preconditions.checkNotNull(o, "different");
    Preconditions.checkNotNull(o, "message");
    Preconditions.checkArgument(o != null, "message %s", 1);
    Preconditions.checkArgument(o != null, "other message");
    Objects.requireNonNull(o);
    Objects.requireNonNull(o);
    builder.that(list).isEqualTo(1);
    builder.that(list).isEqualTo(1);
    assertThat(list).isEqualTo(1);
    ;
    assertThat(list).isEqualTo(1);
    int a = 1, b = 2;
    assertThat(list).isEqualTo(3);
    assertThat(list).isEqualTo(3);
    assertThat(s).isEqualTo("1");
    assertThat(s).isEqualTo("1");
    assertThat(s).isEqualTo("2");
    assertThat(s).isEqualTo("1");
  }

  @SuppressWarnings("DuplicateAssertion")
  void duplicatesSuppressed(List<Integer> list) {
    assertThat(list).isEqualTo(1);
    assertThat(list).isEqualTo(1);
  }

  S23Constants(List<Integer> list) {
    assertThat(list).isEqualTo(1);
    assertThat(list).isEqualTo(1);
  }

  static {
    assertThat(CONSTANT).isEqualTo("x");
    assertThat(CONSTANT).isEqualTo("x");
  }

  String optionals(Optional<String> optional, Optional<String> other) {
    if (!optional.isPresent()) {
      return optional.get();
    }
    if (optional.isEmpty()) {
      optional.orElseThrow();
      other.get();
    }
    if (optional.isPresent()) {
      other.get();
    } else {
      other.get();
      optional.get();
    }
    if (!optional.isPresent() && other.isPresent()) {
      return optional.get() + other.get();
    }
    if (!optional.isPresent() || other.isPresent()) {
      return optional.get();
    }
    String x = !optional.isPresent() ? optional.get() : "";
    String y = optional.isPresent() ? "" : other.get() + optional.get();
    if (optional.isPresent()) {
      return "";
    }
    return optional.get();
  }

  String reassigned(Optional<String> optional) {
    if (!optional.isPresent()) {
      optional = Optional.of("value");
      return optional.get();
    }
    return "";
  }

  String nested(Optional<String> optional) {
    if (!optional.isPresent() || true) {
      return !optional.isPresent() ? optional.get() : "";
    }
    if (!optional.isPresent()) {
      if (optional.equals(Optional.of("OK"))) {
        return optional.get();
      }
    }
    return optional.isPresent() ? optional.get() : "";
  }

  String unknown(Optional<String> optional) {
    if (optional.get() != null) {
      return optional.get();
    }
    return "";
  }

  @SuppressWarnings("OptionalNotPresent")
  String suppressedOptional(Optional<String> optional) {
    if (!optional.isPresent()) {
      return optional.get();
    }
    return "";
  }

  final Optional<String> fieldOptional = Optional.empty();

  String viaField() {
    if (fieldOptional.isEmpty()) {
      return fieldOptional.get();
    }
    if (this.fieldOptional.isEmpty()) {
      return this.fieldOptional.get();
    }
    return "";
  }

  String viaFlag(Optional<String> optional, boolean flag) {
    if (flag && !optional.isPresent()) {
      return optional.get();
    }
    if (!(optional.isPresent())) {
      return optional.get();
    }
    return "";
  }
}
