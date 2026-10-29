package zoo;

import java.util.ArrayList;
import java.util.List;

public abstract class Animal {
  protected final List<String> noises = new ArrayList<>();

  public abstract String sound();

  public List<String> noises() {
    return noises;
  }

  protected String twice() {
    return sound() + sound();
  }

  String quiet() {
    return "";
  }
}
