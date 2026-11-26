package p;
public class H13 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H13 I;
 public static H13 get() { H13 t = I; if (t == null) { t = new H13(); I = t; } return t; }
}
