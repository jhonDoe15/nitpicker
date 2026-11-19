package shop.wrappers;

import java.util.ArrayList;

public class OrderedLog extends ArrayList<String> {
  @Override
  public void add(int index, String entry) { // violation: ForwardDropsParameter
    super.add(entry);
  }

  @Override
  public boolean add(String entry) {
    return super.add(entry.trim());
  }
}
