package p;
public class H19 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H19 I = new H19();
 public static H19 get() { if (I == null) { I = new H19(); } return I; }
}
