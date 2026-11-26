package e;

import java.nio.ByteBuffer;
import java.nio.MappedByteBuffer;

@interface CanIgnoreReturnValue {}

class B5Values {
  @CanIgnoreReturnValue
  int ignorable() {
    return 1;
  }

  int plain() {
    return 1;
  }

  @CanIgnoreReturnValue
  static B5Values create() {
    return new B5Values();
  }

  int field = ignorable();
  int unused = ignorable();
  int unused2 = ignorable(), other = plain();

  void use() {
    int unused = ignorable();
    int unused1 = plain();
    int unused2 = ignorable();
    int unusedBalance = ignorable();
    final int unused3 = this.ignorable();
    Object unused4 = create();
    int x;
    x = ignorable();
    int unused5;
    unused5 = ignorable();
    unused5 = plain();
    int unused6 = 5;
    var unused7 = new B5Values();
    int unusedX = ignorable();
    for (int unused8 = ignorable(); unused8 < 2; unused8++) {}
    try (AutoCloseable unused9 = create2()) {
    } catch (Exception e) {
    }
  }

  @CanIgnoreReturnValue
  AutoCloseable create2() {
    return null;
  }

  byte[] bad(ByteBuffer buffer) {
    return buffer.array();
  }

  byte[] good(ByteBuffer buffer) {
    int offset = buffer.arrayOffset();
    return buffer.array();
  }

  byte[] allocated() {
    ByteBuffer b = ByteBuffer.allocate(10);
    return b.array();
  }

  byte[] wrapped(byte[] in) {
    ByteBuffer b;
    b = ByteBuffer.wrap(in);
    return b.array();
  }

  byte[] late(byte[] in, ByteBuffer p) {
    ByteBuffer b = p;
    byte[] first = b.array();
    b = ByteBuffer.wrap(in);
    return b.array();
  }

  byte[] chain() {
    return ByteBuffer.allocate(5).array();
  }

  byte[] chain2(ByteBuffer p) {
    return p.duplicate().array();
  }

  byte[] chain3(ByteBuffer p) {
    return p.slice().order(null).array();
  }

  byte[] mapped(MappedByteBuffer m) {
    return m.array();
  }

  ByteBuffer fieldBuffer;
  final ByteBuffer wrappedField = ByteBuffer.wrap(new byte[4]);

  byte[] fromField() {
    return fieldBuffer.array();
  }

  byte[] fromWrappedField() {
    return wrappedField.array();
  }

  byte[] thisField() {
    return this.fieldBuffer.array();
  }

  byte[] otherField(B5Values other) {
    return other.fieldBuffer.array();
  }

  byte[] inLambda(ByteBuffer p) {
    java.util.function.Supplier<byte[]> s = () -> p.array();
    return s.get();
  }

  byte[] allocateNested(byte[] in) {
    ByteBuffer b = in == null ? ByteBuffer.allocate(1) : ByteBuffer.wrap(in);
    return b.array();
  }
}
