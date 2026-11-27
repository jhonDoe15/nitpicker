package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RD4 {
static class X extends FileInputStream { X() throws IOException { super(""); } int g() throws IOException { return (byte) this.read() == -1 ? 1 : 0; } }
}
