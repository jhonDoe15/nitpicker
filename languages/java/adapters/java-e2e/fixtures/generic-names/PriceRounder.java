package demo;

import java.util.function.Function;

public class PriceRounder implements Function<Double, Long> {
  @Override
  public Long apply(Double price) {
    return Math.round(price);
  }
}

class AuthenticationManager {}

class CacheManagerImpl {}

class ResourceManager {}

class BaseHelper {} // violation: GenericTypeName

class CustomHelper extends BaseHelper {}

class Utilization {}

class Manageable {}

class Commonwealth {}

class Misconfig {}
