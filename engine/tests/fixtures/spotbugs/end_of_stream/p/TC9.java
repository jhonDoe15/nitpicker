package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC9 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); byte b = (byte) i; switch (i) { case 0: i = 1; break; default: } if (b == -1) return; }
}
