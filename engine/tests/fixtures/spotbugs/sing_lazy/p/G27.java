package p;
public class G27 implements java.io.Serializable {
 private static G27 I;
 public static G27 get() { if (I == null) { synchronized (G27.class) { I = new G27(); } } return I; }
}
