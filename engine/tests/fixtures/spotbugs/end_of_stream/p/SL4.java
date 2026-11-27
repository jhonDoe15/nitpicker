package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SL4 {
static int r(FileInputStream in) throws IOException { return in.read(); } void c(FileInputStream in) throws IOException { if ((byte) r(in) == -1) return; }
}
