package p;

import lombok.NonNull;
public class LmVar {
    public LmVar(@NonNull String... s) {
        System.out.println(s.length);
    }
}
