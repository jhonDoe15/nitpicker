import dagger.Module;
import dagger.Provides;
import java.security.SecureRandom;
import java.util.Random;

@Module
class J5Ub1 {
  @Provides
  Random provideRandom(SecureRandom impl) {
    return impl;
  }
}
