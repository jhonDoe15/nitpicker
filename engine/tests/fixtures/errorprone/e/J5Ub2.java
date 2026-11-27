import dagger.Module;
import dagger.Provides;
import java.security.SecureRandom;
import java.util.Random;

@Module
interface J5Ub2 {
  @Provides
  static Random provideRandom(SecureRandom impl) {
    return impl;
  }
}
