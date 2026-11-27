package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TC1 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; try { System.out.println(); } catch (RuntimeException e) { } i = in.read(); if ((byte) i == -1) return; }
}
