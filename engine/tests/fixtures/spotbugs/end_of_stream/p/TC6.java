package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC6 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = (byte) i; while (f) { i = 0; f = false; } if (b == -1) return; }
}
