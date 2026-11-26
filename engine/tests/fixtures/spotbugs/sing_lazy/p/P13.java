package p;
public class P13 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P13(int a) {}
 P13() {}
 private static P13 I;
 public static P13 get() { if (I == null) { P13 t = new P13(); log(); I = t; } return I; }
}
