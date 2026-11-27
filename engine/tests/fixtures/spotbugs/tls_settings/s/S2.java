package s;
import java.net.*;
import java.io.IOException;

public class S2 {
    static class A extends Socket {
    }
    static class B extends ServerSocket {
        B() throws IOException {
        }
    }
    static class C extends A {
        C() {
            super();
        }
    }
    static class D extends Socket {
        D() {
            this(1);
        }
        D(int x) {
            super();
        }
    }
    void anon() throws IOException {
        Socket s = new Socket() { };
        ServerSocket t = new ServerSocket() { };
        new A();
        Socket u = new Socket(
            "h",
            80);
    }
    Socket field = new Socket();
    static ServerSocket shared;
    static {
        try { shared = new ServerSocket(); } catch (IOException e) { }
    }
    class Inner {
        void m() {
            new Socket();
        }
    }
}
