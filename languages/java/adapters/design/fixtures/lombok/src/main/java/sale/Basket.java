package sale;

import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

public class Basket {
  @Getter private final List<String> lines = new ArrayList<>();
  @Getter(AccessLevel.NONE) private final List<String> hidden = new ArrayList<>();
  @Getter private boolean open;
  @Getter private Boolean sealed;
  @Getter @Setter private List<String> notes = new ArrayList<>();

  public void add(String line) {
    lines.add(line);
    hidden.add(line);
  }
}
