package nitpicker.host;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class Wire {
  private static final int MAX_FRAME_BYTES = 512 * 1024 * 1024;
  private static final int MAX_FRAMES = 1_000_000;

  private Wire() {}

  static List<String> readStrings(InputStream in) throws IOException {
    DataInputStream data = new DataInputStream(in);
    int count = data.readInt();
    if (count < 0 || count > MAX_FRAMES) {
      throw new IOException("bad frame count " + count);
    }
    List<String> frames = new ArrayList<>(count);
    for (int index = 0; index < count; index++) {
      int length = data.readInt();
      if (length < 0 || length > MAX_FRAME_BYTES) {
        throw new IOException("bad frame length " + length);
      }
      frames.add(new String(data.readNBytes(length), StandardCharsets.UTF_8));
    }
    return frames;
  }

  static void write(OutputStream out, List<byte[]> frames) throws IOException {
    DataOutputStream data = new DataOutputStream(out);
    data.writeInt(frames.size());
    for (byte[] frame : frames) {
      data.writeInt(frame.length);
      data.write(frame);
    }
    data.flush();
  }

  static void writeStrings(OutputStream out, String... frames) throws IOException {
    List<byte[]> bytes = new ArrayList<>(frames.length);
    for (String frame : frames) {
      bytes.add(frame.getBytes(StandardCharsets.UTF_8));
    }
    write(out, bytes);
  }
}
