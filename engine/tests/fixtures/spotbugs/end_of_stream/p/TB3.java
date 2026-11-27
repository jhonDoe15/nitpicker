package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB3 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; if (f) i = in.read(); else i = 5; if ((byte) i == -1) return; }
}
