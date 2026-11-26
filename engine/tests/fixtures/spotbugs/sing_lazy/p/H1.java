package p;
public class H1 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H1 I;
 public static H1 get() { if (I == null) { log(); } I = new H1(); return I; }
}
