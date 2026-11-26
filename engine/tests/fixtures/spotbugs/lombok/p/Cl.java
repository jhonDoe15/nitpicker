package p;

import java.io.InputStream;
import lombok.Cleanup;

public class Cl {
    private final int first;

    public Cl(InputStream in) throws java.io.IOException {
        @Cleanup InputStream stream = in;
        this.first = stream.read();
    }
}
