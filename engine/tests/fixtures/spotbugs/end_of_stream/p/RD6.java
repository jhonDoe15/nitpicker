package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RD6 {
static class X extends FileInputStream { X() throws IOException { super(""); } public int read(byte[] b) { return 0; } int g(X x) throws IOException { return (byte) x.read(new byte[1]) == -1 ? 1 : 0; } }
}
