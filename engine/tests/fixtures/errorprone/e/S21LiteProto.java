import com.google.errorprone.annotations.FormatMethod;
import com.google.protobuf.Internal;
import com.google.protobuf.MessageLite;
import com.google.protobuf.ProtocolMessageEnum;
import com.google.protobuf.UnknownFieldSet;

abstract class S21LiteProto {
  abstract static class Lite implements MessageLite {}

  interface FullEnum extends ProtocolMessageEnum, Internal.EnumLite {}

  static class Log {
    static void i(String s) {}

    static void w(String s) {}
  }

  private String positive(Lite message) {
    return message.toString();
  }

  private String concatenated(Lite message) {
    return "" + message;
  }

  private void negative(Lite message) {
    atVerbose(message.toString());
  }

  public void atVerbose(String s) {}

  private String unknownFields(UnknownFieldSet message) {
    return message.toString();
  }

  private String enums(Internal.EnumLite e) {
    return e.toString();
  }

  private String enumsImplicit(Internal.EnumLite e) {
    return "" + e;
  }

  private String fullEnum(FullEnum e) {
    return e.toString();
  }

  private void nested(Lite message) {
    atVerbose().log(message.toString());
  }

  public S21LiteProto atVerbose() {
    return this;
  }

  public S21LiteProto log(String s) {
    return this;
  }

  private void android(Lite message) {
    Log.i(message.toString());
    Log.w(message.toString());
  }

  private void formatted(Lite message) {
    format("tag", "%s", message);
    format(message, "%s", 1);
    String.format("%s", message);
  }

  @FormatMethod
  String format(Object tag, String format, Object... args) {
    return String.format(format, args);
  }

  @SuppressWarnings("LiteProtoToString")
  private String suppressed(Lite message) {
    return message.toString();
  }
}
