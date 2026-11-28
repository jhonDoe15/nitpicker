package p;
public class G33 implements java.io.Serializable {
 private static G33 I;
 public static G33 get() { if (I == null) { I = new G33(); } else { return I; } return I; }
}
