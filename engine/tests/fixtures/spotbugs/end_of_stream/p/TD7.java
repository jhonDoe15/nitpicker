package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TD7 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = (byte) i; do { i = 7; } while (b != -1); }
}
