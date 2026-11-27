package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH6 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte b = (byte) i; Runnable r = () -> {}; if (b == -1) System.out.println(); }
}
