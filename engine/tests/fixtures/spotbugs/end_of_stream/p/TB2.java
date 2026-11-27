package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class TB2 {
void c(FileInputStream in, boolean f) throws IOException { int i = in.read(); if ((byte) i == 5) { } if (f) i = in.read(); if ((byte) i == -1) return; }
}
