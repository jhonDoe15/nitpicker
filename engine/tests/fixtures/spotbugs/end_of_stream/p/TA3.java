package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TA3 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; while (f) { i = in.read(); f = false; } if ((byte) i == -1) return; }
}
