package p;
public class H2 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H2 I;
 public static H2 get() { I = new H2(); if (I == null) { log(); } return I; }
}
