package p;

public class User {
    public AException make() throws java.io.IOException {
        AException e = new AException();
        if (e.code() > 0) throw new java.io.IOException("x");
        return e;
    }
    public static class BException extends Object implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public void run() { System.out.println("x"); }
    }
}
