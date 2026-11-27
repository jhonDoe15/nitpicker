import dagger.Module;
import dagger.Provides;
import java.security.SecureRandom;
import java.util.Random;

@Module
abstract class J5Ub3 {
  @Provides
  static Random provideRandom(SecureRandom impl) {
    return impl;
  }

  @Provides Random other(SecureRandom impl) { return impl; }

  @Provides(type = Provides.Type.SET) Object set(SecureRandom impl) { return impl; }

  @Provides(type = Provides.Type.SET_VALUES) @Deprecated final Object values(Random impl) { return impl; }

  @Provides(type = Provides.Type.MAP)
  Object map(Random impl) {
    return impl;
  }
}
