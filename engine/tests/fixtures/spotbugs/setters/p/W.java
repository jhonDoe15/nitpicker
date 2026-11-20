package p;
import java.io.IOException;
import java.io.OutputStream;
public class W {
    interface Wable { void writeTo(OutputStream o) throws IOException; }
    static class W1 { void writeTo(OutputStream o) {} }
    static class W2 { public void writeTo(OutputStream o) throws IOException {} }
    static class W3 { void write(OutputStream o) {} }
    static class W4 { void write(int b) {} }
    static class W5 { void writeX() {} }
    static class W6 implements Wable { public void writeTo(OutputStream o) throws IOException {} }
    record W7(int a) { void writeTo(OutputStream o) {} }
    static final class W8 { private final int a = 1; void writeTo(OutputStream o) {} }
    static class W9 { void setX(int x) throws IOException {} }
    static class W10 { void addTo(OutputStream o) {} }
    static abstract class W11 { abstract void writeTo(OutputStream o); }
    static class W12 { int a; void writeTo(OutputStream o) {} }
    static class W13 { void writeTo(OutputStream o) throws IOException { o.write(1); } }
    static class W14 { void writeTo(OutputStream o) throws IOException { throw new IOException(); } }
    static class W15 { void setX(int x) { throw new UnsupportedOperationException(); } }
    record W16(int a) { void setX(int x) {} }
    record W17(int a) implements Wable { public void writeTo(OutputStream o) throws IOException { o.write(a); } }
    static class W18 implements Wable { private final int a = 1; public void writeTo(OutputStream o) throws IOException { o.write(a); } }
    static class W19 { void setX(int x) throws IOException { throw new IOException(); } }
    static class W20 { int a; void setX(int x) { a = x; } }
    private W1 f1; private W2 f2; private W3 f3; private W4 f4; private W5 f5; private W6 f6; private W7 f7; private W8 f8; private W9 f9; private W10 f10;
    private W11 f11; private W12 f12; private W13 f13; private W14 f14; private W15 f15; private W16 f16; private W17 f17; private W18 f18; private W19 f19; private W20 f20;
    public W1 g1() { return f1; }
    public W2 g2() { return f2; }
    public W3 g3() { return f3; }
    public W4 g4() { return f4; }
    public W5 g5() { return f5; }
    public W6 g6() { return f6; }
    public W7 g7() { return f7; }
    public W8 g8() { return f8; }
    public W9 g9() { return f9; }
    public W10 g10() { return f10; }
    public W11 g11() { return f11; }
    public W12 g12() { return f12; }
    public W13 g13() { return f13; }
    public W14 g14() { return f14; }
    public W15 g15() { return f15; }
    public W16 g16() { return f16; }
    public W17 g17() { return f17; }
    public W18 g18() { return f18; }
    public W19 g19() { return f19; }
    public W20 g20() { return f20; }
}
