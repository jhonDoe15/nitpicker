package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB7 {
void c(FileInputStream in, boolean f) throws IOException { int i = 0; try { i = in.read(); if ((byte) i == -1) return; } catch (RuntimeException e) { } }
}
