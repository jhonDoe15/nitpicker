package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH1 {
void c(FileInputStream in, InputStream o) throws IOException { int i = in.read(); byte b = (byte) i; i = o.read(); if (b == -1) System.out.println(); }
}
