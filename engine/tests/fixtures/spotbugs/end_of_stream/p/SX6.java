package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SX6 {
void c(FileInputStream in) throws IOException { try { if ((byte) in.read() == -1) System.out.println(); } finally { in.close(); } }
}
