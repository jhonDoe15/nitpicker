package p;
public class P12 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P12(int a) {}
 P12() {}
 private static P12 I;
 public static P12 get() { while (I == null) { I = new P12(); } return I; }
}
