package shop.slips;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

public final class Loops {
  private final Map<String, Object> beans;

  public Loops(Map<String, Object> beans) {
    this.beans = beans;
  }

  public void fetchAll(String[] names, List<Consumer<String>> delegates, List<String> tags) {
    for (String name : names) {
      beans.remove(names[0]); // violation: LoopVariableUnused
    }
    for (String name : names) {
      beans.put(name, names[0]);
    }
    for (int i = 0; i < delegates.size(); i++) {
      delegates.get(0).accept("request"); // violation: LoopVariableUnused
    }
    for (int i = 0; i < names.length; i++) {
      beans.put(names[i], names[0]);
    }
    for (String ignored : names) {
      beans.put("first", names[0]);
    }
    for (String tag : tags) {
      beans.put("tag", tags.get(0)); // violation: LoopVariableUnused
    }
    for (String tag : tags) {
      beans.put(tag, tags.get(0));
    }
  }

  public Object takeFirst(String[] names, List<String> tags) {
    for (String name : names) {
      beans.put("first", names[0]);
      break;
    }
    for (int i = 0; i < tags.size(); i++) {
      return tags.get(0);
    }
    for (String tag : tags) {
      if (beans.isEmpty()) {
        beans.put("tag", tags.get(0));
      }
    }
    return null;
  }
}
