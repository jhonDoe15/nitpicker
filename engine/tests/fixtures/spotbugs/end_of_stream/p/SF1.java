package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SF1 {
void c(FileInputStream in) throws IOException { if ((byte) in.read(new byte[1], 0, 1) == -1) System.out.println(); }
}
