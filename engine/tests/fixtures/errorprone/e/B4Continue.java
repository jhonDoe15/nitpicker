package e;

import java.util.List;

public class B4Continue {
  void m(List<String> list, int n) {
    for (String s : list) {
      if (s.isEmpty()) {
        continue;
      }
      System.out.println(s);
      continue;
    }
    for (int i = 0; i < n; i++) {
      if (i == 1) {
        continue;
      }
      System.out.println(i);
    }
    while (n > 0) {
      n--;
      if (n == 3) {
        System.out.println();
        continue;
      } else {
        System.out.println(n);
      }
    }
    do {
      n++;
      continue;
    } while (n < 10);
    outer:
    for (int i = 0; i < n; i++) {
      for (int j = 0; j < n; j++) {
        if (j == 2) {
          continue outer;
        }
        continue;
      }
    }
    for (int i = 0; i < n; i++) {
      switch (i) {
        case 1:
          System.out.println();
          continue;
        default:
          break;
      }
    }
    for (int i = 0; i < n; i++) {
      switch (i) {
        case 1 -> {
          continue;
        }
        default -> System.out.println();
      }
    }
    for (int i = 0; i < n; i++) {
      try {
        System.out.println();
        continue;
      } finally {
        System.out.println();
      }
    }
    for (int i = 0; i < n; i++) {
      if (i == 0) continue;
    }
    for (int i = 0; i < n; i++) {
      {
        continue;
      }
    }
    for (int i = 0; i < n; i++) {
      ;
      continue;
    }
    for (int i = 0; i < n; i++) {
      Runnable r = new Runnable() {
        public void run() {
          for (int j = 0; j < 3; j++) {
            continue;
          }
        }
      };
    }
  }

  @SuppressWarnings("RedundantControlFlow")
  void s(int n) {
    for (int i = 0; i < n; i++) {
      continue;
    }
  }
}
