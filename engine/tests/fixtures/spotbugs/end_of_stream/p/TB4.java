package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB4 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; try { i = in.read(); } finally { System.out.println(); } if ((byte) i == -1) return; }
}
