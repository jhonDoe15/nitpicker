import com.google.protobuf.AbstractMessageLite;

class S38Oneof {
  enum ValueCase implements AbstractMessageLite.InternalOneOfEnum {
    FOO(1),
    BAR_BAZ(2),
    QUX(3),
    VALUE_NOT_SET(0);
    private final int number;
    ValueCase(int number) {
      this.number = number;
    }
    @Override
    public int getNumber() {
      return number;
    }
  }

  static final class Msg {
    ValueCase getValueCase() {
      return ValueCase.FOO;
    }
    String getFoo() {
      return "";
    }
    String getBarBaz() {
      return "";
    }
    String getQux() {
      return "";
    }
    Msg getInner() {
      return this;
    }
  }

  private final Msg field = new Msg();

  void a(Msg msg) {
    switch (msg.getValueCase()) {
      case FOO:
        msg.getFoo();
        msg.getBarBaz();
        break;
      case BAR_BAZ:
        msg.getFoo();
      case QUX:
        msg.getFoo();
        msg.getQux();
        msg.getBarBaz();
        return;
      default:
        msg.getQux();
    }
  }

  String b(Msg msg) {
    return switch (msg.getValueCase()) {
      case FOO -> msg.getBarBaz();
      case BAR_BAZ, QUX -> msg.getFoo() + msg.getQux();
      case VALUE_NOT_SET -> {
        Runnable r = () -> msg.getFoo();
        yield "";
      }
    };
  }

  void c(Msg msg) {
    switch ((field.getValueCase())) {
      case FOO:
        field.getBarBaz();
        msg.getBarBaz();
        break;
      default:
    }
    switch (msg.getInner().getValueCase()) {
      case FOO:
        msg.getInner().getQux();
        msg.getQux();
        break;
      default:
    }
    Msg other = msg;
    other = new Msg();
    switch (other.getValueCase()) {
      case FOO:
        other.getQux();
        break;
      default:
    }
  }

  @SuppressWarnings("WrongOneof")
  void d(Msg msg) {
    switch (msg.getValueCase()) {
      case FOO:
        msg.getQux();
        break;
      default:
    }
  }
}
