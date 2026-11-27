package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RD3 {
static class X extends FileInputStream { X() throws IOException { super(""); } int g() throws IOException { return (byte) super.read() == -1 ? 1 : 0; } }
}
