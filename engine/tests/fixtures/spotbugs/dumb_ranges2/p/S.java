package p;

public class S {
    static final byte[] B4 = new byte[4];
    static final char[] C4 = new char[4];
    static final int[] I4 = new int[4];
    static final int[] I8 = new int[8];

    void isr(java.io.InputStream x) throws Exception {
        x.read(B4, 0, 5);
    }

    void fis(java.io.FileInputStream x) throws Exception {
        x.read(B4, 0, 5);
    }

    void bais() throws Exception {
        new java.io.ByteArrayInputStream(B4, 0, 5);
    }

    void baos(java.io.ByteArrayOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void fos(java.io.FileOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void ps(java.io.PrintStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void dos(java.io.DataOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void dis(java.io.DataInputStream x) throws Exception {
        x.readFully(B4, 0, 5);
    }

    void raf(java.io.RandomAccessFile x) throws Exception {
        x.write(B4, 0, 5);
    }

    void rafr(java.io.RandomAccessFile x) throws Exception {
        x.read(B4, 0, 5);
    }

    void reader(java.io.Reader x) throws Exception {
        x.read(C4, 0, 5);
    }

    void bw(java.io.BufferedWriter x) throws Exception {
        x.write(C4, 0, 5);
    }

    void caw(java.io.CharArrayWriter x) throws Exception {
        x.write(C4, 0, 5);
    }

    void pw(java.io.PrintWriter x) throws Exception {
        x.write(C4, 0, 5);
    }

    void sbapp(StringBuilder x) throws Exception {
        x.append(C4, 0, 5);
    }

    void sbins(StringBuilder x) throws Exception {
        x.insert(0, C4, 0, 5);
    }

    void sbfapp(StringBuffer x) throws Exception {
        x.append(C4, 0, 5);
    }

    void strb() throws Exception {
        new String(B4, 0, 5);
    }

    void strbc() throws Exception {
        new String(B4, 0, 5, java.nio.charset.StandardCharsets.UTF_8);
    }

    void stri() throws Exception {
        new String(I4, 0, 5);
    }

    void valueof() throws Exception {
        String.valueOf(C4, 0, 5);
    }

    void copyv() throws Exception {
        String.copyValueOf(C4, 0, 5);
    }

    void md(java.security.MessageDigest x) throws Exception {
        x.update(B4, 0, 5);
    }

    void crc(java.util.zip.CRC32 x) throws Exception {
        x.update(B4, 0, 5);
    }

    void bb() throws Exception {
        java.nio.ByteBuffer.wrap(B4, 0, 5);
    }

    void cb() throws Exception {
        java.nio.CharBuffer.wrap(C4, 0, 5);
    }

    void bbput(java.nio.ByteBuffer x) throws Exception {
        x.put(B4, 0, 5);
    }

    void bbget(java.nio.ByteBuffer x) throws Exception {
        x.get(B4, 0, 5);
    }

    void fill() throws Exception {
        java.util.Arrays.fill(I4, 0, 5, 1);
    }

    void sort() throws Exception {
        java.util.Arrays.sort(I4, 0, 5);
    }

    void bin() throws Exception {
        java.util.Arrays.binarySearch(I4, 0, 5, 1);
    }

    void cor() throws Exception {
        java.util.Arrays.copyOfRange(I4, 0, 5);
    }

    void aslist() throws Exception {
        java.util.Arrays.asList(1).subList(0, 5);
    }

    void out(java.io.OutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void w(java.io.Writer x) throws Exception {
        x.write(C4, 0, 5);
    }

    void wstr(java.io.Writer x) throws Exception {
        x.write("abcd", 0, 5);
    }

    void ios(java.io.ObjectOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void gz(java.util.zip.GZIPOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void bos(java.io.BufferedOutputStream x) throws Exception {
        x.write(B4, 0, 5);
    }

    void bis(java.io.BufferedInputStream x) throws Exception {
        x.read(B4, 0, 5);
    }

    void own(Own x) throws Exception {
        x.write(B4, 0, 5);
    }

    void ownin(OwnIn x) throws Exception {
        x.read(B4, 0, 5);
    }

    void off(java.io.OutputStream x) throws Exception {
        x.write(B4, 4, 0);
    }

    void off4l(java.io.OutputStream x) throws Exception {
        x.write(B4, 4, 1);
    }

    void offneg(java.io.OutputStream x) throws Exception {
        x.write(B4, -1, 0);
    }

    void lenneg(java.io.OutputStream x) throws Exception {
        x.write(B4, 0, -1);
    }

    void sum(java.io.OutputStream x) throws Exception {
        x.write(B4, 2, 3);
    }

    void ok(java.io.OutputStream x) throws Exception {
        x.write(B4, 4, 0);
    }

    void acsrc() throws Exception {
        System.arraycopy(I4, 4, I8, 0, 0);
    }

    void acdst() throws Exception {
        System.arraycopy(I8, 0, I4, 4, 0);
    }

    void acdst2() throws Exception {
        System.arraycopy(I8, 0, I4, 5, 0);
    }

    void acsum() throws Exception {
        System.arraycopy(I8, 2, I4, 0, 5);
    }

    void acsum2() throws Exception {
        System.arraycopy(I8, 6, I4, 0, 3);
    }

    void acsum3() throws Exception {
        System.arraycopy(I4, 0, I8, 6, 3);
    }

    void acboth() throws Exception {
        System.arraycopy(I4, 3, I8, 6, 3);
    }

    void acneglen(int[] y) throws Exception {
        System.arraycopy(y, 0, y, 0, -2);
    }

    void acnegsrc(int[] y) throws Exception {
        System.arraycopy(y, -2, y, 0, 1);
    }

    void acnegdst(int[] y) throws Exception {
        System.arraycopy(y, 0, y, -2, 1);
    }

    void acoff0(int[] y) throws Exception {
        System.arraycopy(I4, 4, y, 0, 0);
    }

    void aclen9(int[] y) throws Exception {
        System.arraycopy(y, 0, y, 0, 9);
    }

    void strlen() throws Exception {
        new String(C4, 1, 4);
    }

    void stroff5() throws Exception {
        new String(C4, 5, 0);
    }

    static class Own extends java.io.OutputStream {
        public void write(int b) {
        }
    }

    static class OwnIn extends java.io.InputStream {
        public int read() {
            return 0;
        }
    }
}
