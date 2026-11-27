package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB1 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); if ((byte) i == 5) { } try { i = 3; } finally { } if ((byte) i == -1) return; }
}
