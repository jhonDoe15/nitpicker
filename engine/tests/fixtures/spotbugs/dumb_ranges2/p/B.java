package p;

import java.util.Arrays;

public class B {
    void copies(int[] in, int[] out, byte[] bytes, java.io.OutputStream os) throws Exception {
        int[] a = new int[3];
        int[] b = new int[2];
        System.arraycopy(a, 0, b, 0, 3);
        System.arraycopy(a, 4, b, 0, 0);
        System.arraycopy(a, 0, b, 3, 0);
        System.arraycopy(a, 1, b, 0, 2);
        System.arraycopy(a, 3, b, 0, 0);
        System.arraycopy(in, -1, out, 0, 1);
        System.arraycopy(in, 0, out, -1, 1);
        System.arraycopy(in, 0, out, 0, -1);
        System.arraycopy(a, 0, out, 0, 5);
        System.arraycopy(in, 0, a, 0, 5);
    }

    void others(java.io.OutputStream os, java.io.InputStream is, java.io.Writer w) throws Exception {
        byte[] b = new byte[4];
        os.write(b, 0, 5);
        os.write(b, 5, 0);
        os.write(b, 2, 3);
        is.read(b, 0, 9);
        char[] c = new char[2];
        String s = new String(c, 0, 3);
        String t = new String(c, 3, 0);
        String u = String.valueOf(c, 0, 4);
        w.write(c, 1, 2);
        StringBuilder sb = new StringBuilder();
        sb.append(c, 0, 3);
        int[] x = Arrays.copyOfRange(new int[2], 0, 5);
        Arrays.fill(new int[2], 0, 5, 1);
        java.nio.ByteBuffer.wrap(b, 0, 6);
    }
}
