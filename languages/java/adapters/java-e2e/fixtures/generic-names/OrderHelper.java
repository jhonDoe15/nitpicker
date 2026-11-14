package demo;

public class OrderHelper {} // violation: GenericTypeName

final class StringUtils {} // violation: GenericTypeName

interface PriceCommon {} // violation: GenericTypeName

enum StatusMisc { // violation: GenericTypeName
  OPEN
}

record RateManager(int percent) {} // violation: GenericTypeName

class UtilityMethods {} // violation: GenericTypeName

class UserHelperImpl {} // violation: GenericTypeName
