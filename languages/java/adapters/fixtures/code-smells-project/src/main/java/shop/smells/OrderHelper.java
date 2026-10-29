package shop.smells;

public final class OrderHelper { // violation: GenericTypeName
  private OrderHelper() {}

  interface OrderHelperMixin {} // violation: GenericTypeName

  abstract static class HelperBase {} // violation: GenericTypeName

  static final class UtilsModule {} // violation: GenericTypeName

  static final class Utils2 {} // violation: GenericTypeName

  interface LoggingMixin {}

  abstract static class ModelBase {}

  abstract static class Base {}

  static final class SessionManagers {}
}
