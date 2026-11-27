package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC2 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); try { System.out.println(); } catch (RuntimeException e) { i = 0; } if ((byte) i == -1) return; }
}
