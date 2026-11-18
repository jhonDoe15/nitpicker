package shop;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

class Copies {
  int[] grown(int count) {
    int[] values = new int[4];
    for (int i = 0; i < count; i++) {
      if (i == values.length) {
        values = Arrays.copyOf(values, values.length * 2);
      }
      values[i] = i;
    }
    return values;
  }

  List<Integer> copiedEachStep(List<Integer> items) {
    List<Integer> all = new ArrayList<>();
    for (Integer item : items) {
      List<Integer> next = new ArrayList<>(all);
      next.add(item);
      all = next;
    }
    return all;
  }

  Map<Long, List<String>> copiedPerKey(List<Long> keys, Map<Long, List<String>> fetched) {
    Map<Long, List<String>> out = new HashMap<>();
    for (Long key : keys) {
      List<String> roles = fetched.get(key);
      out.put(key, roles == null ? List.of() : List.copyOf(roles));
    }
    return out;
  }

  Map<Long, List<String>> normalizedPerKey(List<Long> keys, Map<Long, List<String>> fetched) {
    Map<Long, List<String>> out = new HashMap<>();
    for (Long key : keys) {
      List<String> roles = fetched.get(key);
      roles = roles == null ? List.of() : List.copyOf(roles);
      out.put(key, roles);
    }
    return out;
  }
}
