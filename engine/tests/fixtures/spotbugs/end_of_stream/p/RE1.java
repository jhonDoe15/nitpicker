package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RE1 {
void c(FileInputStream in) throws IOException { Runnable r = new Runnable() { public void run() { try { if ((byte) in.read() == -1) return; } catch (IOException e) { } } }; }
}
