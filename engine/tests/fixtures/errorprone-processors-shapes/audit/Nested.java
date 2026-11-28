package audit;

public class Nested {
  enum Mode {
    ON {
      @Override
      int level() {
        return 1;
      }
    };

    int level() {
      return 0;
    }
  }

  Runnable task() {
    class Local {
      int twice(int value) {
        return value * 2;
      }
    }
    return new Runnable() {
      @Override
      public void run() {
        new Local().twice(1);
      }
    };
  }
}
