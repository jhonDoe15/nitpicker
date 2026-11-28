package p;

import java.io.*;
import javax.imageio.stream.*;

public class A {
    interface I1 extends DataInput { int skipBytes(int n) throws IOException; long skipBytes(long n) throws IOException; }
    interface I4 extends ImageInputStream { }
    static abstract class Own extends ImageInputStreamImpl { }
    void a1(I1 i) throws IOException {
        i.skipBytes(1);
    }
    void a2(I4 i, byte[] b) throws IOException {
        i.skipBytes(1);
        i.read(b);
    }
    void a3(Own o) throws IOException {
        o.skipBytes(1);
    }
    void a4(FileCacheImageInputStream f) throws IOException {
        f.skipBytes(3);
        f.skipBytes(3L);
    }
}
