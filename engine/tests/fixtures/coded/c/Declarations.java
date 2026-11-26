package c;

import java.sql.ResultSet;
import java.sql.SQLException;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public abstract class Declarations implements Cloneable {
    private int zero = 0;
    private int sum = 1 - 1;
    private long longZero = 0L;
    private char nul = '\u0000';
    private char letter = 'a';
    private boolean off = false;
    private Object nothing = null;
    private int[] array = null;
    private int fromField = zero;
    private double real = 0.0;
    private final int fixed = 0;
    private static String text = null;

    public String toString() {
        return "d";
    }

    public boolean equals(Object other) {
        return other == this;
    }

    @Override
    public int hashCode() {
        return 1;
    }

    void reassign(int first, String second) {
        first = 2;
        first = 3;
        try {
            second.length();
        } catch (RuntimeException e) {
            e = null;
            e = new RuntimeException();
        }
        int unused = 1;
        int ignoredValue = 2;
        int used = 3;
        int written = 4;
        written = 5;
        int counted = 0;
        counted++;
        System.out.println(used + second);
    }

    void results(ResultSet rows) throws SQLException {
        rows.next();
        if (rows.next()) {
            rows.first();
        }
        while (rows.next()) {
            rows.last();
        }
    }

    void keys(byte[] given) {
        new SecretKeySpec("secret".getBytes(), "AES");
        byte[] key = new byte[] {1, 2, 3};
        new SecretKeySpec(key, "AES");
        new SecretKeySpec(given, "AES");
        String iv = "vector";
        new IvParameterSpec(iv.getBytes());
    }

    @Override
    protected Object clone() throws CloneNotSupportedException {
        return new Declarations() {};
    }
}

abstract class NoAbstractMethods {
    void run() {}
}

abstract class Extended extends NoAbstractMethods {
}

class Copy {
    public Object clone() {
        return new Copy();
    }
}

final class FinalCopy implements Cloneable {
    public Object clone() {
        return new FinalCopy();
    }
}

class Refused {
    public Object clone() throws CloneNotSupportedException {
        throw new CloneNotSupportedException();
    }
}

class Singleton {
    private static Singleton instance;

    public static Singleton getInstance() {
        return instance;
    }

    public static Singleton getInstance(Object hint) {
        return instance;
    }
}
