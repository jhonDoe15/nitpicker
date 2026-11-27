package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RA2 {
void c(FileInputStream in, boolean f) throws IOException { if ((byte) (f ? in.read() : in.read()) == -1) return; }
}
