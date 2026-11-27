package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RB2 {
Runnable r = () -> { try { FileInputStream in = new FileInputStream(""); if ((byte) in.read() == -1) System.out.println(); } catch (IOException e) { } };
}
