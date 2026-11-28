package e;

import com.google.protobuf.Descriptors.Descriptor;
import com.google.protobuf.Message;

final class S14Descriptors {
  static final class FieldMessage implements Message {
    static final int FIELD_FIELD_NUMBER = 1;
    static final int OTHER_FIELD_NUMBER = 2;
    static final int PLAIN = 3;

    static Descriptor getDescriptor() {
      return null;
    }
  }

  static final class MultiMessage implements Message {
    static final int MULTI_FIELD_FIELD_NUMBER = 4;

    static Descriptor getDescriptor() {
      return null;
    }
  }

  static class NotAMessage {
    static final int NOT_FIELD_NUMBER = 5;

    static Descriptor getDescriptor() {
      return null;
    }
  }

  static class Child extends FieldMessage2 {}

  static class FieldMessage2 implements Message {
    static final int INHERITED_FIELD_NUMBER = 6;

    static Descriptor getDescriptor() {
      return null;
    }
  }

  void negative(Descriptor d) {
    FieldMessage.getDescriptor().findFieldByNumber(FieldMessage.FIELD_FIELD_NUMBER);
    FieldMessage.getDescriptor().findFieldByNumber(1);
    d.findFieldByNumber(FieldMessage.FIELD_FIELD_NUMBER);
    FieldMessage.getDescriptor().findFieldByNumber(FieldMessage.PLAIN);
    FieldMessage.getDescriptor().findFieldByNumber(FieldMessage.OTHER_FIELD_NUMBER);
    NotAMessage.getDescriptor().findFieldByNumber(FieldMessage.FIELD_FIELD_NUMBER);
    FieldMessage.getDescriptor().findFieldByNumber(NotAMessage.NOT_FIELD_NUMBER);
    Child.getDescriptor().findFieldByNumber(FieldMessage2.INHERITED_FIELD_NUMBER);
  }

  void positive() {
    FieldMessage.getDescriptor().findFieldByNumber(MultiMessage.MULTI_FIELD_FIELD_NUMBER);
    MultiMessage.getDescriptor().findFieldByNumber(FieldMessage.FIELD_FIELD_NUMBER);
    Child.getDescriptor().findFieldByNumber(FieldMessage.FIELD_FIELD_NUMBER);
    FieldMessage.getDescriptor().findFieldByNumber(Child.INHERITED_FIELD_NUMBER);
  }

  @SuppressWarnings("MixedDescriptors")
  void suppressed() {
    FieldMessage.getDescriptor().findFieldByNumber(MultiMessage.MULTI_FIELD_FIELD_NUMBER);
  }
}
