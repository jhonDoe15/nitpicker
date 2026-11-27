package c;

import javax.crypto.Cipher;

public class V9 {
    String own = "DES";
    private String set;

    V9() {
        set = "DES";
    }

    Cipher a() throws Exception {
        Cipher one = Cipher.getInstance(own);
        Cipher two = Cipher.getInstance(set);
        return one == null ? two : one;
    }
}
