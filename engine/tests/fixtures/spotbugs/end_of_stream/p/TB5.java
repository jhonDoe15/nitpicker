package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB5 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; try { i = in.read(); } catch (IOException e) { throw e; } if ((byte) i == -1) return; }
}
