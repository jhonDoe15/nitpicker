package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SG7 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = f ? (byte) i : 0; if (b == -1) return; }
}
