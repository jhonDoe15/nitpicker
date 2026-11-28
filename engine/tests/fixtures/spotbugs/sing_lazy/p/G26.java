package p;
public class G26 implements java.io.Serializable {
 private static G26 I;
 static void mk() { I = new G26(); }
 public static G26 get() { if (I == null) mk(); return I; }
}
