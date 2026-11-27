package p;

import java.io.BufferedReader;
import java.io.IOException;

public class N {
    BufferedReader r;
    BufferedReader f;
    BufferedReader[] rs;

    BufferedReader get() {
        return r;
    }

    int split() throws IOException {
        return r.readLine().split(",").length;
    }

    int charat() throws IOException {
        return r.readLine().charAt(0);
    }

    int isempty() throws IOException {
        return r.readLine().isEmpty() ? 1 : 0;
    }

    int tostr() throws IOException {
        return r.readLine().toString().length();
    }

    int intern() throws IOException {
        return r.readLine().intern().length();
    }

    int eqic() throws IOException {
        return r.readLine().equalsIgnoreCase("x") ? 1 : 0;
    }

    int bytes() throws IOException {
        return r.readLine().getBytes().length;
    }

    int chars() throws IOException {
        return r.readLine().toCharArray().length;
    }

    int cs() throws IOException {
        return ((CharSequence) r.readLine()).length();
    }

    int hash() throws IOException {
        return r.readLine().hashCode();
    }

    int vo() throws IOException {
        return String.valueOf(r.readLine()).length();
    }

    int sync() throws IOException {
        synchronized (r.readLine()) { return 1; }
    }

    int cmp() throws IOException {
        return r.readLine().compareTo("x");
    }

    int thr() throws IOException {
        return r.readLine().getClass().hashCode();
    }

    int lines() throws IOException {
        return r.lines().count() > 0 ? 1 : 0;
    }

    int fmt() throws IOException {
        return System.console().readLine("x").trim().length();
    }

    int strip() throws IOException {
        return r.readLine().strip().length();
    }

    int field() throws IOException {
        return f.readLine().length();
    }

    int arr() throws IOException {
        return rs[0].readLine().length();
    }

    int meth() throws IOException {
        return get().readLine().length();
    }

    int mixed() throws IOException {
        return r.readLine().length() + r.readLine().trim().length();
    }

    int nul() throws IOException {
        String s = r.readLine(); return s == null ? 0 : s.length();
    }

    int ifn() throws IOException {
        if (r.readLine().length() > 0) { return 1; } return 0;
    }

    int sc() throws IOException {
        return new java.util.Scanner(System.in).nextLine().length();
    }

    int jline() throws IOException {
        return r.readLine().trim().length();
    }

}
