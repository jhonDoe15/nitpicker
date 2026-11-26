package p;
public class P1 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P1(int a) {}
 P1() {}
 private static P1 I;
 public static P1 get() { if (I == null) { log(); I = new P1(); } return I; }
}
