import dagger.producers.ProducerModule;
import dagger.producers.Produces;
import java.security.SecureRandom;
import java.util.Random;

@ProducerModule
final class J5Ub4 {
  @Produces
  Random produceRandom(SecureRandom impl) {
    return impl;
  }
}
