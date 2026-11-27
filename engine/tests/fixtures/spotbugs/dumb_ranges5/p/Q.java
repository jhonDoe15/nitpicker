package p;

public class Q {
    static final byte[] B4 = new byte[4];
    static final int[] I4 = new int[4];
    java.io.OutputStream os;
    byte[] y;
    private int x;
    private int[] FM = new int[3];
    private int[] FCM = new int[3];
    private static int[] FSI = new int[3];
    private int[] FPR = new int[3];
    int[] FN;
    int[] FPA;
    private int NUM = 5;
    private int NUM2 = 5;
    private int Z;
    private String SFLD = "a";
    String SD = "abc";

    Q() {
        FCM = new int[3];
    }

    Q(int[] p) {
        FPA = p;
        x = 2;
    }

    void m() {
        FM = new int[3];
        NUM2 = 5;
        Z = 9;
    }

    static {
        FSI = new int[3];
    }

    String trim() throws Exception {
        return " ab ".trim().substring(4);
    }

    String trim2() throws Exception {
        return " ab ".trim().substring(3);
    }

    String sb1() throws Exception {
        return new StringBuilder("ab").append("c").toString().substring(9);
    }

    String sb2() throws Exception {
        return new StringBuilder().append("abc").toString().substring(9);
    }

    String sb3() throws Exception {
        return new StringBuilder("abc").toString().charAt(3) + "";
    }

    String wo() throws Exception {
        os.write(B4, x, 5); return "";
    }

    String wl() throws Exception {
        os.write(B4, 0, x); return "";
    }

    String wux() throws Exception {
        os.write(y, x, -1); return "";
    }

    String wneg() throws Exception {
        os.write(B4, x, -1); return "";
    }

    String acx() throws Exception {
        System.arraycopy(I4, x, I4, 0, 5); return "";
    }

    String fm() throws Exception {
        return "" + FM[3];
    }

    String fcm() throws Exception {
        return "" + FCM[3];
    }

    String fsi() throws Exception {
        return "" + FSI[3];
    }

    String fpr() throws Exception {
        return "" + FPR[3];
    }

    String fnull() throws Exception {
        return "" + FN[3];
    }

    String fpar() throws Exception {
        return "" + FPA[3];
    }

    String fnum() throws Exception {
        int[] a = new int[2]; return "" + a[NUM];
    }

    String fnum2() throws Exception {
        int[] a = new int[2]; return "" + a[NUM2];
    }

    String fl() throws Exception {
        int[] a = new int[2]; return "" + a[Z];
    }

    String strf() throws Exception {
        return SFLD.substring(9);
    }

    String strd() throws Exception {
        return SD.substring(9);
    }

}
