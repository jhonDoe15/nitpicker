package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH7 {
byte f; void c(FileInputStream in) throws IOException { int i = in.read(); f = (byte) i; if (f == -1) System.out.println(); }
}
