package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SL7 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte b = (byte) i; while (b != -1) { i = in.read(); b = (byte) i; } }
}
