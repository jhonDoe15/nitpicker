package p;

import java.util.Date;
import java.util.List;
import lombok.Data;

@Data
public class Dt {
    private Date when;
    private List<String> names;
    private int count;
}
