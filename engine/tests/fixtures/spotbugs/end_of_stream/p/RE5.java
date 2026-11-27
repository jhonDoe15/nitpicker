package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class RE5 {
void c(FileInputStream in) throws IOException { int r = switch (in.read()) { case 1 -> (byte) in.read() == -1 ? 1 : 0; default -> 0; }; }
}
