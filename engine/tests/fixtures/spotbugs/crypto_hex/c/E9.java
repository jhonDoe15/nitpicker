package c;

public enum E9 {
    A,
    B;
    static { E9z.M.digest(); Integer.toHexString(1); }
}

class E9z {
    static java.security.MessageDigest M;
}
