package e;

import static com.google.common.truth.extensions.proto.ProtoTruth.assertThat;

import com.google.auto.value.AutoValue;
import com.google.protobuf.AbstractMessageLite;
import com.google.protobuf.ByteString;
import com.google.protobuf.GeneratedMessage;
import com.google.protobuf.Internal;
import com.google.protobuf.Message;
import com.google.protobuf.MessageLite;
import java.util.function.Consumer;

class S15Proto {
  static final class First extends GeneratedMessage implements Message, MessageLite {
    public static final int ALPHA_FIELD_NUMBER = 1;
    public static final int BETA_FIELD_NUMBER = 2;
    public static final int GAMMA_DELTA_FIELD_NUMBER = 3;
    public static final int LEVEL_FIELD_NUMBER = 4;
    public static final int NAMES_FIELD_NUMBER = 5;
    public static final int DATA_FIELD_NUMBER = 6;

    public enum ChoiceCase implements AbstractMessageLite.InternalOneOfEnum {
      ONE(1),
      TWO_WORDS(2),
      CHOICE_NOT_SET(0);

      private final int number;

      ChoiceCase(int number) {
        this.number = number;
      }

      public int getNumber() {
        return number;
      }
    }

    public ByteString toByteString() {
      return null;
    }

    public Builder toBuilder() {
      return null;
    }

    static Builder newBuilder() {
      return new Builder();
    }

    static First getDefaultInstance() {
      return null;
    }

    static final class Builder extends GeneratedMessage.Builder<Builder> {
      Builder setAlpha(int value) {
        return this;
      }

      Builder setAlphaValue(int value) {
        return this;
      }

      Builder setBeta(String value) {
        return this;
      }

      Builder setBetaBytes(ByteString value) {
        return this;
      }

      Builder setGammaDelta(String value) {
        return this;
      }

      Builder setGammaDeltaBytes(ByteString value) {
        return this;
      }

      Builder setLevel(Level level) {
        return this;
      }

      Builder setUnknownField(String value) {
        return this;
      }

      Builder setUnknownFieldValue(int value) {
        return this;
      }

      Builder addNames(String value) {
        return this;
      }

      Builder setNames(int index, String value) {
        return this;
      }

      Builder putData(String key, String value) {
        return this;
      }

      Builder putData(int key, String value) {
        return this;
      }

      Builder clearAlpha() {
        return this;
      }

      Builder setOne(int value) {
        return this;
      }

      Builder setTwoWords(String value) {
        return this;
      }

      Builder setNested(Second.Builder value) {
        return this;
      }

      Builder getNestedBuilder() {
        return this;
      }

      public First build() {
        return null;
      }

      public First buildPartial() {
        return null;
      }

      public boolean isInitialized() {
        return true;
      }
    }
  }

  static final class Second extends GeneratedMessage implements Message, MessageLite {
    public static final int ALPHA_FIELD_NUMBER = 1;
    public static final int OTHER_FIELD_NUMBER = 2;

    public ByteString toByteString() {
      return null;
    }

    public Builder toBuilder() {
      return null;
    }

    static Builder newBuilder() {
      return new Builder();
    }

    static Second getDefaultInstance() {
      return null;
    }

    static final class Builder extends GeneratedMessage.Builder<Builder> {
      Builder setAlpha(int value) {
        return this;
      }

      public Second build() {
        return null;
      }

      public Second buildPartial() {
        return null;
      }

      public boolean isInitialized() {
        return true;
      }
    }
  }

  enum Level implements Internal.EnumLite {
    LOW,
    HIGH,
    UNRECOGNIZED;

    public int getNumber() {
      return 0;
    }
  }

  enum Explicit implements Internal.EnumLite {
    FIRST,
    UNRECOGNIZED;

    public static final int UNRECOGNIZED_VALUE = -1;

    public int getNumber() {
      return 0;
    }
  }

  enum PlainEnum {
    A,
    UNRECOGNIZED
  }

  static final int INDEX = 1;
  static final String KEY = "k";

  void redundant(Second second) {
    First.newBuilder().setAlpha(1).setBeta("a").setAlpha(1);
    First.newBuilder().setAlpha(1).setAlpha(2).build();
    First.newBuilder().setAlpha(1).setAlpha(1).setAlpha(1);
    First.newBuilder().setAlpha(1).setAlpha(1).setAlpha(2);
    First.newBuilder().setAlpha(1).setAlphaValue(1);
    First.newBuilder().setBeta("a").setBetaBytes(null);
    First.newBuilder().setGammaDelta("a").setGammaDelta("a");
    First.newBuilder().setGammaDelta("a").setGammaDeltaBytes(null).setGammaDelta("b");
    First.newBuilder().addNames("a").addNames("a");
    First.newBuilder().setNames(0, "a").setNames(1, "b").setNames(0, "c");
    First.newBuilder().setNames(INDEX, "a").setNames(INDEX, "a");
    First.newBuilder().putData("a", "1").putData("b", "2").putData("a", "3");
    First.newBuilder().putData(KEY, "1").putData("k", "2");
    First.newBuilder().putData(1, "1").putData(1, "1").putData("1", "1");
    First.newBuilder().setOne(1).setTwoWords("a");
    First.newBuilder().setOne(1).setOne(2);
    First.newBuilder().setOne(1).setOne(1).setTwoWords("a");
    First.newBuilder().setUnknownField("a").setUnknownFieldValue(1);
    First.newBuilder().setNested(Second.newBuilder().setAlpha(1).setAlpha(1)).setNested(null);
    First.newBuilder().getNestedBuilder().getNestedBuilder();
    First.newBuilder().setAlpha(1).build().toBuilder().setAlpha(1);
    First.newBuilder().setLevel(Level.LOW).setLevel(Level.HIGH);
    First.newBuilder().clearAlpha().clearAlpha();
    Second.newBuilder().setAlpha(1).setAlpha(1);
    First.Builder held = First.newBuilder();
    held.setAlpha(1).setAlpha(1);
    held.setAlpha(1);
    held.setAlpha(1);
  }

  @SuppressWarnings("RedundantSetterCall")
  void redundantSuppressed() {
    First.newBuilder().setAlpha(1).setAlpha(1);
  }

  @AutoValue
  abstract static class Animal {
    abstract String name();

    static Builder builder() {
      return null;
    }

    @AutoValue.Builder
    abstract static class Builder {
      abstract Builder setName(String name);

      abstract Builder setAge(int age);

      Builder nonAbstract(String foo) {
        return null;
      }

      abstract Animal build();
    }
  }

  void autoValue() {
    Animal.builder().setName("foo").setName("bar").build();
    Animal.builder().setName("foo").setName("foo");
    Animal.builder().nonAbstract("foo").nonAbstract("bar").build();
    Animal.builder().setName("foo").setAge(1).setName("bar").setAge(1);
  }

  void unrecognized(First.Builder builder) {
    builder.setLevel(Level.UNRECOGNIZED);
    builder.setLevel(Level.LOW);
    builder.setLevel(S15Proto.Level.UNRECOGNIZED);
    First.newBuilder().setLevel(Level.UNRECOGNIZED);
    First.newBuilder().setUnknownField("a");
    First.newBuilder().clearAlpha();
  }

  @SuppressWarnings("SetUnrecognized")
  void unrecognizedSuppressed(First.Builder builder) {
    builder.setLevel(Level.UNRECOGNIZED);
  }

  void mixed(Iterable<First> firsts) {
    assertThat(First.getDefaultInstance()).ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFields(First.ALPHA_FIELD_NUMBER, Second.OTHER_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFields(First.ALPHA_FIELD_NUMBER, First.BETA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFields(1, 2);
    assertThat(First.getDefaultInstance()).ignoringFields(First.ALPHA_FIELD_NUMBER).ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFields(Second.ALPHA_FIELD_NUMBER).ignoringFields(First.ALPHA_FIELD_NUMBER);
    assertThat((Message) First.getDefaultInstance()).ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFieldAbsence().ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(firsts).ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(Second.getDefaultInstance()).ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).same.ignoringFields(Second.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).same.ignoringFields(First.ALPHA_FIELD_NUMBER);
    assertThat(First.getDefaultInstance()).ignoringFieldAbsence().same.ignoringFields(Second.OTHER_FIELD_NUMBER);
  }

  @SuppressWarnings("ProtoTruthMixedDescriptors")
  void mixedSuppressed() {
    assertThat(First.getDefaultInstance()).ignoringFields(Second.ALPHA_FIELD_NUMBER);
  }

  void builds(First.Builder builder, First first, Consumer<First.Builder> consumer) {
    builder.build();
    builder.buildPartial();
    First.newBuilder().setAlpha(1).build();
    First.newBuilder().build();
    first.toBuilder().build();
    first.toBuilder().setAlpha(1).build();
    First.getDefaultInstance().toBuilder().setAlpha(1).buildPartial();
    First kept = builder.build();
    consumer = First.Builder::build;
    consumer = First.Builder::buildPartial;
    consumer = b -> b.build();
    consumer = b -> {
      b.build();
    };
    Runnable run = () -> builder.build();
    Runnable other = builder::build;
    java.util.function.Supplier<First> supplier = builder::build;
    java.util.function.Function<First.Builder, First> function = First.Builder::build;
    builder.setAlpha(1).build();
    this.hashCode();
    if (builder.isInitialized()) {
      builder.build();
    }
    for (int i = 0; i < 1; builder.build()) {
      break;
    }
  }

  @SuppressWarnings("ProtoBuilderReturnValueIgnored")
  void buildsSuppressed(First.Builder builder) {
    builder.build();
  }
}
