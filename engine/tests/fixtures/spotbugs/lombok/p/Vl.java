package p;

import java.util.Date;
import lombok.NonNull;
import lombok.Value;

@Value
public class Vl {
    @NonNull Date when;
    String name;
}
