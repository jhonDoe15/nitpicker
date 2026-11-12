package sale;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class Receipt {
  private String number;
  private final List<String> entries = new ArrayList<>();
}
