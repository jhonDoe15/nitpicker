package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC3 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); try { System.out.println(); i = 0; } catch (RuntimeException e) { } if ((byte) i == -1) return; }
}
