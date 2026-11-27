package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RA1 {
void c(FileInputStream in, boolean f) throws IOException { if ((byte) (f ? in.read() : 0) == -1) return; }
}
