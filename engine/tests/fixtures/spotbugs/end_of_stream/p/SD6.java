package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SD6 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); int j = f ? i : i; byte b = (byte) j; if (b == -1) return; }
}
