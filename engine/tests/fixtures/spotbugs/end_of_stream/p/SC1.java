package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SC1 {
static class X extends FileInputStream { X() throws IOException { super(""); } } void c(X in) throws IOException { if ((byte) in.read() == -1) System.out.println(); }
}
