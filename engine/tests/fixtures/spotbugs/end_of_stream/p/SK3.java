package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SK3 {
void c(FileInputStream in) throws IOException { if ((byte) in.read() == -1 && (byte) in.read() == 0) System.out.println(); }
}
