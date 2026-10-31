package shop;

import java.util.List;

public abstract class Hook {
  public long run(List<Long> cents) {
    return compute(cents);
  }

  protected abstract long compute(List<Long> cents);
}
