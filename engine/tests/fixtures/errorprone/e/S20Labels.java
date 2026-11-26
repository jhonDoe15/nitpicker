class S20Labels {
  void labels(boolean x) {
    unused:
    for (int i = 0; i < 2; i++) {}

    used:
    for (int i = 0; i < 2; i++) {
      for (int j = 0; j < 2; j++) {
        if (x) {
          continue used;
        }
        if (j == 1) {
          break used;
        }
      }
    }

    block:
    {
      if (x) {
        break block;
      }
    }

    alsoUnused:
    while (x) {
      break;
    }

    other:
    {
      x = false;
    }
    int y = 0;
    other:
    for (; y < 1; y++) {}
    {
      other2:
      y++;
    }
  }

  @SuppressWarnings("UnusedLabel")
  void suppressed() {
    skipped:
    for (; ; ) {
      break;
    }
  }

  void sameName(boolean x) {
    dup:
    for (; x; ) {
      break dup;
    }
  }

  void onClassLevel() {
    Runnable r =
        () -> {
          inLambda:
          for (int i = 0; i < 1; i++) {}
        };
    new Object() {
      void m() {
        inAnon:
        for (int i = 0; i < 1; i++) {
          break inAnon;
        }
      }
    };
  }

  int switches(int x, boolean flag) {
    switch (x) {
      case 1 -> {
        System.out.println();
        break;
      }
      case 2 -> {
        if (flag) {
          break;
        } else {
          System.out.println();
        }
      }
      case 3 -> System.out.println();
      case 4 -> {
        if (flag) {
          System.out.println();
          break;
        }
        System.out.println();
      }
      case 5 -> {
        if (flag) {
          break;
        }
      }
      case 6 -> {
        while (flag) {
          break;
        }
      }
      case 7 -> {
        lbl:
        {
          break lbl;
        }
      }
      case 8 -> {
        if (flag) break;
        else if (!flag) break;
        else break;
      }
      default -> throw new IllegalStateException();
    }
    switch (x) {
      case 1:
        System.out.println();
        break;
      default:
        break;
    }
    return switch (x) {
      case 1 -> {
        yield 1;
      }
      default -> 2;
    };
  }

  @SuppressWarnings("UnnecessaryBreakInSwitch")
  void suppressedBreak(int x) {
    switch (x) {
      case 1 -> {
        break;
      }
      default -> {}
    }
  }
}
