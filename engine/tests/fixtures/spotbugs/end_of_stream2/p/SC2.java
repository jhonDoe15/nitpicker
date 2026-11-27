package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SC2 {
static class X extends FileReader { X() throws IOException { super(""); } } void c(X in) throws IOException { if ((char) in.read() == -1) System.out.println(); }
}
