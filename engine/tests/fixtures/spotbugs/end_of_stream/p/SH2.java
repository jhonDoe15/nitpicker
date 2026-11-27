package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class SH2 {
void c(FileInputStream in) throws IOException { int i = in.read(); byte b = (byte) i; i = in.read(); if (b == -1) System.out.println(); }
}
