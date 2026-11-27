package p;

public class S {
    static final byte[] B4 = new byte[4];
    static final char[] C4 = new char[4];
    static final int[] I4 = new int[4];
    static final int[] I8 = new int[8];
    static final int[] E = new int[0];
    static final byte[] EB = new byte[0];
    private final java.io.PrintStream os = System.out;

    void w1(byte[] y) throws Exception {
        os.write(y, -1, 1);
    }

    void w2(byte[] y) throws Exception {
        os.write(y, -1, 0);
    }

    void w3(byte[] y) throws Exception {
        os.write(y, -2, 1);
    }

    void w4(byte[] y) throws Exception {
        os.write(y, -2, 2);
    }

    void w5(byte[] y) throws Exception {
        os.write(y, -2, 3);
    }

    void w6() throws Exception {
        os.write(B4, -1, 1);
    }

    void w7() throws Exception {
        os.write(B4, -1, 5);
    }

    void w8() throws Exception {
        os.write(B4, -1, 6);
    }

    void w9() throws Exception {
        os.write(B4, -3, 2);
    }

    void w10() throws Exception {
        os.write(B4, 6, -1);
    }

    void w11() throws Exception {
        os.write(B4, 3, 2);
    }

    void w12() throws Exception {
        os.write(B4, 0, 4);
    }

    void a1() throws Exception {
        System.arraycopy(I4, -1, I8, 0, 1);
    }

    void a2(int[] y) throws Exception {
        System.arraycopy(y, -1, y, 0, 0);
    }

    void a3(int[] y) throws Exception {
        System.arraycopy(y, -1, y, 0, 2);
    }

    void a4(int[] y) throws Exception {
        System.arraycopy(y, -3, y, 0, 3);
    }

    void a5(int[] y) throws Exception {
        System.arraycopy(y, -3, y, 0, 4);
    }

    void a6() throws Exception {
        System.arraycopy(I4, 0, I8, 0, 4);
    }

    void a7() throws Exception {
        System.arraycopy(I4, 3, I8, 0, 1);
    }

    void a8() throws Exception {
        System.arraycopy(I4, 3, I8, 0, 2);
    }

    void a9() throws Exception {
        System.arraycopy(I8, 0, I4, 3, 1);
    }

    void a10() throws Exception {
        System.arraycopy(I8, 0, I4, 3, 2);
    }

    void a11() throws Exception {
        System.arraycopy(I4, 5, I8, 9, 0);
    }

    void a12() throws Exception {
        System.arraycopy(E, 0, I8, 0, 0);
    }

    void a13() throws Exception {
        System.arraycopy(E, 0, I8, 0, 1);
    }

    void a14(int[] y) throws Exception {
        System.arraycopy(y, 0, E, 0, 1);
    }

    void a15(int[] y) throws Exception {
        System.arraycopy(y, 0, y, -1, 0);
    }

    void w13() throws Exception {
        System.arraycopy(E, 0, E, 0, 0);
    }

    void w14() throws Exception {
        os.write(EB, 0, 1);
    }

    void w15() throws Exception {
        os.write(EB, 1, 0);
    }

    void w16() throws Exception {
        os.write(EB, 0, 0);
    }

    void r1(java.io.InputStream in) throws Exception {
        in.read(B4, 2, 3);
    }

    void s1() throws Exception {
        new String(C4, -1, 2);
    }

    void s2(char[] y) throws Exception {
        new String(y, -1, 2);
    }

    void sbyte() throws Exception {
        new String(B4, 0, 5, "UTF-8");
    }

    void shi() throws Exception {
        new String(B4, 0, 0, 5);
    }

    void cps() throws Exception {
        new String(I4, 0, 5);
    }

    void big() throws Exception {
        os.write(new byte[3], 0, 4);
    }

    void loc() throws Exception {
        byte[] b = new byte[2]; os.write(b, 1, 2);
    }

    void locn() throws Exception {
        int n = 3; os.write(B4, n, 2);
    }

}
