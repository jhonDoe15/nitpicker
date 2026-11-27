package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SG6 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = (byte) i; if (f) i = 0; if (b == -1) return; }
}
