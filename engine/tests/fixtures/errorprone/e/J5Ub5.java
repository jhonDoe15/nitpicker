import dagger.Module;
import dagger.Provides;
import java.security.SecureRandom;
import java.util.Random;

@Module
class J5Ub5 {
  @Provides
  Random provideRandom(SecureRandom impl) {
    return impl;
  }

  void helper() {}
}

@Module(injects = Object.class)
class J5Ub5Old {
  @Provides
  Random provideRandom(SecureRandom impl) {
    return impl;
  }
}

@Module
class J5Ub5Sub extends Object {
  @Provides
  Random provideRandom(SecureRandom impl) {
    return impl;
  }
}

@Module
abstract class J5Ub5Other {
  @Provides
  Random notSimple(SecureRandom impl) {
    Random other = impl;
    return other;
  }

  @Provides
  Random twoParameters(SecureRandom impl, Random b) {
    return impl;
  }

  @Provides
  Random parenthesized(SecureRandom impl) {
    return (impl);
  }
}
