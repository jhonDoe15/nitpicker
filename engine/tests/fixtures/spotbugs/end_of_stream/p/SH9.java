package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH9 {
void c(FileInputStream in) throws IOException { int i = in.read(); System.out.println((byte) i == -1); }
}
