package p;
public class H3 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H3 I;
 public static H3 get() { if (flag) I = new H3(); if (I == null) log(); return I; }
}
