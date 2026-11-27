package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RD5 {
static class X extends FileInputStream { X() throws IOException { super(""); } public int read(byte[] b) { return 0; } int g() throws IOException { return (byte) read() == -1 ? 1 : 0; } }
}
