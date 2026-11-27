package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SX5 {
void c(FileInputStream in) throws IOException { Runnable r = () -> { try { if ((byte) in.read() == -1) System.out.println(); } catch (IOException e) { } }; r.run(); }
}
