package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SG4 {
void c(FileInputStream in) throws IOException { int i; while ((i = in.read()) != -1) { byte b = (byte) i; if (b == -1) return; } }
}
