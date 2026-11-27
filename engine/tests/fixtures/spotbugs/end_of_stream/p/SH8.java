package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH8 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte[] a = {(byte) i}; if (a[0] == -1) System.out.println(); }
}
