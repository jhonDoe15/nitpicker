package p;
public class H12 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H12 I;
 public static H12 get() { H12 t = I; if (t == null) { I = new H12(); } return I; }
}
