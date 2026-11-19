package shop.receivers;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ChainLinks {
  private final Chain head = new Chain();
  private final Map<String, String> defaults = new HashMap<>();

  public void merge(Map<String, String> transientVariables) {
    defaults.putAll(defaults); // violation: ReceiverPassedAsArgument
    defaults.putAll(transientVariables);
  }

  public void link(Chain node, Chain neighbour) {
    node.setPeer(node); // violation: ReceiverPassedAsArgument
    node.setNext(node);
    node.setNext(neighbour);
    node.attach(node); // violation: ReceiverPassedAsArgument
    node.refine(node);
    node.dot(node);
    node.accept(node);
    neighbour.refine(node);
  }

  public Set<String> copy(Set<String> unsafeRefs) {
    Set<String> safeRefs = new HashSet<>();
    safeRefs.addAll(safeRefs);
    safeRefs.addAll(unsafeRefs);
    safeRefs.removeAll(safeRefs);
    safeRefs.retainAll(safeRefs);
    safeRefs.containsAll(safeRefs);
    safeRefs.contains(safeRefs);
    return safeRefs;
  }

  public boolean same(Chain first, String label) {
    return first.equals(first) || label.equalsIgnoreCase(label) || label.compareTo(label) == 0;
  }

  public void viaField(Chain node) {
    this.head.refine(node);
    head.setPeer(head); // violation: ReceiverPassedAsArgument
    node.refine(node.self());
    node.refine(node.getNext());
    node.setPeer(this.head);
  }

  public List<String> names(Map<String, String> input) {
    List<String> result = new ArrayList<>(input.keySet());
    result.add(String.valueOf(result.size()));
    defaults.putAll(input);
    return result;
  }
}
