package e;

import com.google.common.html.types.SafeHtmlProto;
import com.google.common.html.types.SafeUrlProto;
import com.google.protobuf.ByteString;
import com.google.protobuf.GeneratedMessageLite;
import com.google.protobuf.Internal;

class S12Proto {
  static SafeHtmlProto safeHtmlProto;

  static {
    safeHtmlProto =
        SafeHtmlProto.newBuilder()
            .clearPrivateDoNotAccessOrElseSafeHtmlWrappedValue()
            .setPrivateDoNotAccessOrElseSafeHtmlWrappedValue("foo")
            .build();
  }

  static SafeHtmlProto safeHtmlProtoFromBytes;

  static {
    safeHtmlProtoFromBytes =
        SafeHtmlProto.newBuilder().setPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes(ByteString.copyFromUtf8("foo")).build();
  }

  static String readSafeHtmlProto(SafeHtmlProto safeHtmlProto) {
    if (safeHtmlProto.hasPrivateDoNotAccessOrElseSafeHtmlWrappedValue()) {
      return safeHtmlProto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValue();
    }
    return safeHtmlProto.getSomethingElse();
  }

  static ByteString readSafeHtmlProtoBytes(SafeHtmlProto safeHtmlProto) {
    return safeHtmlProto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes();
  }

  static String readSafeHtmlProtoBuilder(SafeHtmlProto.Builder safeHtmlProto) {
    if (safeHtmlProto.hasPrivateDoNotAccessOrElseSafeHtmlWrappedValue()) {
      return safeHtmlProto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValue();
    }
    return "";
  }

  static ByteString readSafeHtmlProtoBuilderBytes(SafeHtmlProto.Builder safeHtmlProto) {
    return safeHtmlProto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValueBytes();
  }

  static String readUrl(SafeUrlProto url) {
    return url.getPrivateDoNotAccessOrElseSafeUrlWrappedValue();
  }

  static SafeUrlProto buildUrl() {
    return SafeUrlProto.newBuilder().setPrivateDoNotAccessOrElseSafeUrlWrappedValue("a").build();
  }

  @SuppressWarnings("PrivateSecurityContractProtoAccess")
  static String suppressed(SafeHtmlProto proto) {
    return proto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValue();
  }

  static abstract class Proto extends com.google.protobuf.GeneratedMessage {
    abstract String getMessage();

    abstract int getId();

    String self(String other) {
      boolean r = getMessage() == other;
      return r ? "a" : "b";
    }
  }

  static abstract class LiteProto extends GeneratedMessageLite {
    abstract String getMessage();
  }

  static class NotProto {
    String getMessage() {
      return "";
    }
  }

  boolean strings(Proto proto, LiteProto lite, NotProto notProto, String other) {
    boolean r = false;
    r |= proto.getMessage() == "";
    r |= "" == proto.getMessage();
    r |= proto.getMessage() != "";
    r |= proto.getMessage() == other;
    r |= other != proto.getMessage();
    r |= proto.getMessage() == proto.getMessage();
    r |= lite.getMessage() == "x";
    r |= lite.getMessage() != other;
    r |= proto.getMessage() == null;
    r |= null == proto.getMessage();
    r |= proto.getId() == 0;
    r |= notProto.getMessage() == "";
    r |= (proto.getMessage()) == "";
    r |= proto.getMessage() + "a" == "";
    r |= other == other;
    return r;
  }

  @SuppressWarnings("ProtoStringFieldReferenceEquality")
  boolean suppressedStrings(Proto proto) {
    return proto.getMessage() == "";
  }

  enum ProtoLiteEnum implements Internal.EnumLite {
    FOO(1),
    BAR(2);

    private final int number;

    private ProtoLiteEnum(int number) {
      this.number = number;
    }

    @Override
    public int getNumber() {
      return number;
    }
  }

  enum PlainEnum {
    A
  }

  static void ordinals(ProtoLiteEnum value, PlainEnum plain) {
    ProtoLiteEnum.FOO.ordinal();
    value.ordinal();
    int n = value.getNumber();
    plain.ordinal();
    PlainEnum.A.ordinal();
  }

  @SuppressWarnings("ProtocolBufferOrdinal")
  static int suppressedOrdinal(ProtoLiteEnum value) {
    return value.ordinal();
  }
}
