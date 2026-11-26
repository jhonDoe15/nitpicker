package e;

import com.google.protobuf.Message;
import com.google.protobuf.ProtocolMessageEnum;
import java.util.List;

class B6Proto {
  static final int SIZE_VALUE = 0;

  static final class Msg implements Message {
    static final int NAMED_FIELD_NUMBER = 1;
    static final int MISNAMED_FIELD_NUMBER = 2;

    static Builder newBuilder() {
      return new Builder();
    }

    static final class Builder implements Message.Builder {
      Builder setColor(Color color) {
        return this;
      }

      Builder setColorValue(int value) {
        return this;
      }

      Builder addColor(Color color) {
        return this;
      }

      Builder addColorValue(int value) {
        return this;
      }

      Builder putColor(String key, Color color) {
        return this;
      }

      Builder putColorValue(String key, int value) {
        return this;
      }

      Builder setNamedValue(int value) {
        return this;
      }

      Builder setNamed(Color color) {
        return this;
      }

      Builder setMisnamedValue(int value) {
        return this;
      }

      Builder setMisnamed(Color color) {
        return this;
      }

      Builder setCountValue(int value) {
        return this;
      }

      Builder setSize(int size) {
        return this;
      }

      Builder setSizeValue(int value) {
        return this;
      }

      Builder setLongValue(long value) {
        return this;
      }

      Builder setLong(Color color) {
        return this;
      }

      Builder setValue(int value) {
        return this;
      }

      Builder clearColorValue() {
        return this;
      }
    }
  }

  enum Color implements ProtocolMessageEnum {
    RED(0),
    GREEN(1),
    BLUE(2);

    public static final int RED_VALUE = 0;
    public static final int GREEN_VALUE = 1;
    public static final int BLUE_VALUE = 2;
    public static final int OTHER = 7;

    private final int number;

    Color(int number) {
      this.number = number;
    }

    @Override
    public int getNumber() {
      return number;
    }
  }

  void positive(int dynamic) {
    Msg.newBuilder().setColorValue(1);
    Msg.newBuilder().setColorValue(Color.RED_VALUE);
    Msg.newBuilder().addColorValue(2);
    Msg.newBuilder().putColorValue("k", 0);
    Msg.Builder builder = Msg.newBuilder();
    builder.setColorValue(1).addColorValue(1 + 1);
    builder.setColorValue(Color.GREEN_VALUE);
  }

  void negative(int dynamic) {
    Msg.newBuilder().setColorValue(dynamic);
    Msg.newBuilder().setColorValue(9);
    Msg.newBuilder().setColorValue(Color.OTHER);
    Msg.newBuilder().setNamedValue(1);
    Msg.newBuilder().setMisnamedValue(1);
    Msg.newBuilder().setCountValue(1);
    Msg.newBuilder().setSizeValue(1);
    Msg.newBuilder().setLongValue(1);
    Msg.newBuilder().setValue(1);
    Msg.newBuilder().clearColorValue();
    Msg.newBuilder().setColor(Color.RED);
    Msg.newBuilder().putColorValue("k", dynamic);
  }

  @SuppressWarnings("AvoidValueSetter")
  void suppressed() {
    Msg.newBuilder().setColorValue(1);
  }
}
