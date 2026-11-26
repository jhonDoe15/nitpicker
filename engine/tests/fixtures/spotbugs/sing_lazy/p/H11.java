package p;
public class H11 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H11 I;
 public static H11 get() { if (I != null && flag) { log(); } else { I = new H11(); } return I; }
}
