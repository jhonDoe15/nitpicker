package p;
public class T4 implements java.io.Serializable {
 private static T4 I, J;
 static boolean f;
 public static T4 a() { if (I == null) I = new T4(); if (J == null) J = new T4(); return f ? I : J; }
}
