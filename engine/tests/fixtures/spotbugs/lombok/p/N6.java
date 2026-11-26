package p;

import lombok.NonNull;

public class N6 {
    private final String a;

    public N6(@NonNull String a) {
        super();
        this.a = a;
    }

    public void use(@NonNull String b) {
        System.out.println(b);
    }
}
