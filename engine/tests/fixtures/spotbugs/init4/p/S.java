package p;

public class S {
    static int sf;
    static int sm() { return 1; }
    static int a = U.uf;
    static int b = T.sf;
    static int c = T.sm();
    static Runnable r = () -> System.out.println(T.tf);
    static int d = P.pf;
    static {
        P.pf = 3;
    }
    static int e = Q.qf;
    static int f = Q.qm();
    static int g = W.wf;
}
