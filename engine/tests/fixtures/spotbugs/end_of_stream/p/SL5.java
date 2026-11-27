package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SL5 {
void c(FileInputStream in) throws IOException { for (int i = in.read(); i != -1; i = in.read()) { byte b = (byte) i; if (b == -1) return; } }
}
