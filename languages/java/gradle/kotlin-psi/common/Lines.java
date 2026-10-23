package nitpicker.kotlinpsi.common;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class Lines {
  private final int[] starts;
  private final int count;

  public Lines(String text) {
    List<Integer> found = new ArrayList<>(List.of(0));
    for (int i = 0; i < text.length(); i++) {
      if (text.charAt(i) == '\n') {
        found.add(i + 1);
      }
    }
    this.starts = found.stream().mapToInt(Integer::intValue).toArray();
    this.count = text.endsWith("\n") ? starts.length - 1 : starts.length;
  }

  public int count() {
    return count;
  }

  public int index(int offset) {
    int index = Arrays.binarySearch(starts, offset);
    return index >= 0 ? index : -index - 2;
  }
}
