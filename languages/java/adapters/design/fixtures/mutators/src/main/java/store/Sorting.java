package store;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class Sorting {
  public void sorted(Basket basket) {
    Collections.sort(basket.lines(), null);
  }

  public void filled(Basket basket, String item) {
    Collections.fill(basket.lines(), item);
  }

  public void ordered(Basket basket) {
    Arrays.sort(basket.codes());
  }

  public void iterated(Basket basket) {
    basket.lines().iterator().remove();
  }

  public void sliced(Basket basket) {
    basket.lines().subList(0, 1).clear();
  }

  public void either(Basket basket, boolean first, String item) {
    List<String> lines = first ? basket.lines() : basket.copy();
    lines.add(item);
  }

  public void redeclared(Basket basket, String item) {
    {
      List<String> lines = basket.lines();
      lines.size();
    }
    {
      List<String> lines = new ArrayList<>();
      lines.add(item);
    }
  }
}
