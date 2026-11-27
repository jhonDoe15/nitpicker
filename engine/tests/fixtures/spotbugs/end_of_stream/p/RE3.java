package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RE3 {
interface I { default void c(FileInputStream in) throws IOException { if ((byte) in.read() == -1) return; } }
}
