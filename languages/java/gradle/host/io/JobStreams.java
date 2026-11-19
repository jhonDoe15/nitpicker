package nitpicker.host.io;

import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.Charset;

public final class JobStreams {
  private static volatile OutputStream out;
  private static volatile OutputStream err;
  private static PrintStream originalOut;
  private static PrintStream originalErr;

  private JobStreams() {}

  public static synchronized void install(Charset charset) {
    if (originalOut != null) {
      return;
    }
    originalOut = System.out;
    originalErr = System.err;
    System.setOut(new PrintStream(new Switch(true), true, charset));
    System.setErr(new PrintStream(new Switch(false), true, charset));
  }

  public static void begin(OutputStream jobOut, OutputStream jobErr) {
    out = jobOut;
    err = jobErr;
  }

  public static void end() {
    System.out.flush();
    System.err.flush();
    out = null;
    err = null;
  }

  private static final class Switch extends OutputStream {
    private final boolean isOut;

    Switch(boolean isOut) {
      this.isOut = isOut;
    }

    private OutputStream target() {
      OutputStream job = isOut ? out : err;
      return job != null ? job : isOut ? originalOut : originalErr;
    }

    @Override
    public void write(int value) throws IOException {
      target().write(value);
    }

    @Override
    public void write(byte[] bytes, int offset, int length) throws IOException {
      target().write(bytes, offset, length);
    }

    @Override
    public void flush() throws IOException {
      target().flush();
    }
  }
}
