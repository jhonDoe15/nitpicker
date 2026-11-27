import dagger.Module;
import dagger.Provides;
import java.security.SecureRandom;
import java.util.Random;

@Module
public final class J5Ub6 {
  @Provides
  static Random provideRandom(SecureRandom impl) {
    return impl;
  }

  @Provides
  Random second(SecureRandom impl) { return impl; }
}

@Module
final class J5Ub6Ctor {
  J5Ub6Ctor() {}

  @Provides
  Random provideRandom(SecureRandom impl) {
    return impl;
  }
}
