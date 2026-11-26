package repeats;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Pairs {
  record Kind(String name, boolean variable) {}

  void zipped(List<Kind> wanted, List<Kind> parameters) {
    List<Kind> declared = parameters.stream().filter(kind -> !kind.variable()).toList();
    for (int i = 0; i < wanted.size() && i < declared.size(); i++) {
      System.out.println(wanted.get(i).name() + declared.get(i).name());
    }
  }

  void removed(List<Kind> wanted, List<Kind> parameters) {
    List<Kind> declared = new ArrayList<>(parameters);
    declared.removeIf(Kind::variable);
    for (int i = 0; i < declared.size(); i++) {
      System.out.println(wanted.get(i).name() + declared.get(i).name());
    }
  }

  void bothFiltered(List<Kind> wanted, List<Kind> parameters) {
    List<Kind> left = wanted.stream().filter(kind -> !kind.variable()).toList();
    List<Kind> right = parameters.stream().filter(kind -> !kind.variable()).toList();
    for (int i = 0; i < left.size(); i++) {
      System.out.println(left.get(i).name() + right.get(i).name());
    }
  }

  void plain(List<Kind> wanted, List<Kind> parameters) {
    for (int i = 0; i < wanted.size(); i++) {
      System.out.println(wanted.get(i).name() + parameters.get(i).name());
    }
    List<Kind> declared = parameters.stream().filter(kind -> !kind.variable()).toList();
    for (int i = 0; i < declared.size(); i++) {
      System.out.println(declared.get(i).name());
    }
  }

  record Store(String field, boolean changeable, int rank) {}

  record Finding(String field, int rank) {}

  void scans(List<Finding> findings, Map<String, List<Store>> storesByField) {
    for (Finding waiting : findings) {
      List<Store> stores = storesByField.get(waiting.field());
      if (stores.stream().anyMatch(Store::changeable)) {
        System.out.println(waiting);
      }
    }
    findings.forEach(finding -> {
      if (storesByField.get(finding.field()).stream().noneMatch(store -> store.changeable())) {
        System.out.println(finding);
      }
    });
    for (Finding waiting : findings) {
      List<Store> stores = storesByField.get(waiting.field());
      if (stores.stream().anyMatch(store -> store.rank() < waiting.rank())) {
        System.out.println(waiting);
      }
    }
    for (Finding waiting : findings) {
      List<Store> stores = storesByField.get("fixed");
      if (stores.stream().anyMatch(Store::changeable)) {
        System.out.println(waiting);
      }
    }
  }
}
