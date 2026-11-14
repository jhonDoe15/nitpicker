package shop;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

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
}
