package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC4 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = (byte) i; try { System.out.println(); i = 0; } catch (RuntimeException e) { } if (b == -1) return; }
}
