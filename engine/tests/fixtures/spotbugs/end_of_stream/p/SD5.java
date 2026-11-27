package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SD5 {
void c(FileInputStream in) throws IOException { if ((byte) in.read() == (byte) 0xff) System.out.println(); }
}
