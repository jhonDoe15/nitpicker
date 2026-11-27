package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SE1 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte b = (byte) i; byte c = b; if (c == -1) System.out.println(); }
}
