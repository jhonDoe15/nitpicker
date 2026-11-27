package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SL3 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte b = (byte) i; System.out.println(i); if (b == -1) return; }
}
