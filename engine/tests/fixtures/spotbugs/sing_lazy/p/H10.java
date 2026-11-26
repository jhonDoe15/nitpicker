package p;
public class H10 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H10 I;
 public static H10 get() { if (I == null || flag) { I = new H10(); } return I; }
}
