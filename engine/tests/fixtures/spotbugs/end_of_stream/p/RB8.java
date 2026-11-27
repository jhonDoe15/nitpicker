package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RB8 {
<T extends InputStream & Closeable> void c(T in) throws IOException { if ((byte) in.read() == -1) return; }
}
