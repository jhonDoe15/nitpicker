package sales;

import java.util.List;

public abstract class Holder<T> {
  private T held;
  private List<? super T> history;
}
