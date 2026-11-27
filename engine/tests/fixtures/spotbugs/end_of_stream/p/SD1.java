package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SD1 {
void c(FileInputStream in) throws IOException { if (((byte) in.read() & 0xff) == -1) System.out.println(); }
}
