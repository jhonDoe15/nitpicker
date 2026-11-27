import dagger.Module;
import dagger.Provides;

@Module
class J5Ub7 {
  @Provides
  Object varargs(Object... values) {
    return values;
  }
}

@Module
enum J5Ub7Enum {
  ONLY;

  @Provides
  Object provide(String value) {
    return value;
  }
}

@Module
record J5Ub7Record(int x) {
  @Provides
  Object provide(String value) {
    return value;
  }
}
