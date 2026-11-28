package p;
public class H8 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H8 I;
 public static H8 get() { if (I != null) { return I; } synchronized (H8.class) { I = new H8(); } return I; }
}
