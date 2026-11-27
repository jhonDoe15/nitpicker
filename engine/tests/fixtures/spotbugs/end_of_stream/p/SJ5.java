package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SJ5 {
void c(FileInputStream in) throws IOException { if ((byte) in.readNBytes(new byte[1], 0, 1) == -1) System.out.println(); }
}
