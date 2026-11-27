package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RE2 {
enum E { A { void c(FileInputStream in) throws IOException { if ((byte) in.read() == -1) return; } }; }
}
