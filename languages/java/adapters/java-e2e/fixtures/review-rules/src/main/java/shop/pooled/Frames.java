package shop.pooled;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.ByteBufAllocator;
import io.netty.buffer.Unpooled;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public final class Frames {
  private final ByteBufAllocator allocator;
  private ByteBuf pending;

  public Frames(ByteBufAllocator allocator) {
    this.allocator = allocator;
  }

  public boolean sameFrame(String left, String right) {
    ByteBuf leftBuf = encode(left); // violation: BufferNeverReleased
    ByteBuf rightBuf = encode(right); // violation: BufferNeverReleased
    return leftBuf.equals(rightBuf);
  }

  public int sizeOf(String text) {
    ByteBuf scratch = allocator.directBuffer(64); // violation: BufferNeverReleased
    scratch.writeCharSequence(text, StandardCharsets.UTF_8);
    return scratch.readableBytes();
  }

  public String peek() {
    ByteBuf copy = pending.retainedDuplicate(); // violation: BufferNeverReleased
    return copy.toString(StandardCharsets.UTF_8);
  }

  public boolean sameFrameReleased(String left, String right) {
    ByteBuf leftBuf = encode(left);
    ByteBuf rightBuf = encode(right);
    try {
      return leftBuf.equals(rightBuf);
    } finally {
      leftBuf.release();
      rightBuf.release();
    }
  }

  public ByteBuf frame(String text) {
    ByteBuf buf = allocator.buffer(text.length());
    buf.writeCharSequence(text, StandardCharsets.UTF_8);
    return buf;
  }

  public void keep(String text) {
    ByteBuf buf = encode(text);
    this.pending = buf;
  }

  public List<ByteBuf> collect(String text) {
    List<ByteBuf> out = new ArrayList<>();
    ByteBuf buf = encode(text);
    buf.writeByte(0);
    out.add(buf);
    return out;
  }

  public int heapSize(String text) {
    ByteBuf heap = Unpooled.copiedBuffer(text, StandardCharsets.UTF_8);
    return heap.readableBytes();
  }

  public ByteBuf copyOf(int length) {
    ByteBuf copy = allocator.directBuffer(length);
    return copy.writeZero(length);
  }

  private ByteBuf encode(String text) {
    return frame(text).writeByte(1);
  }
}
