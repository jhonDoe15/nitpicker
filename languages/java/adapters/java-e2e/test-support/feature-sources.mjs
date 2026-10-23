function featureClass(packageName, name, body) {
  return `package ${packageName};

public final class ${name} {
${body}
}
`;
}

const ROOT = 'src/main/java/shop';

export const FEATURE_FILES = {
  [`${ROOT}/features/billing/Invoice.java`]: featureClass(
    'shop.features.billing',
    'Invoice',
    '  public int total() {\n    return new shop.features.shipping.internal.Writer().cost();\n  }',
  ),
  [`${ROOT}/features/shipping/ShippingApi.java`]: featureClass(
    'shop.features.shipping',
    'ShippingApi',
    '  public int quote() {\n    return new shop.features.billing.Invoice().total();\n  }',
  ),
  [`${ROOT}/features/shipping/internal/Writer.java`]: featureClass(
    'shop.features.shipping.internal',
    'Writer',
    '  public int cost() {\n    return 2;\n  }',
  ),
  [`${ROOT}/catalog/Catalog.java`]: featureClass(
    'shop.catalog',
    'Catalog',
    '  public int size() {\n    return new shop.pricing.Prices().count() + 1;\n  }\n\n  public int base() {\n    return 3;\n  }',
  ),
  [`${ROOT}/pricing/Prices.java`]: featureClass(
    'shop.pricing',
    'Prices',
    '  public int count() {\n    return new shop.catalog.Catalog().base();\n  }',
  ),
};

export const DOMAIN_FILES = {
  [`${ROOT}/orders/domain/OrderNumbers.java`]: featureClass(
    'shop.orders.domain',
    'OrderNumbers',
    '  public String next(java.nio.file.Path seen) {\n    return java.nio.file.Files.exists(seen)\n        ? java.util.UUID.randomUUID().toString()\n        : String.valueOf(new java.util.Random().nextInt());\n  }',
  ),
  [`${ROOT}/orders/domain/Order.java`]: featureClass(
    'shop.orders.domain',
    'Order',
    '  public String customer() throws java.sql.SQLException {\n    return shop.common.Lookup.name();\n  }',
  ),
  [`${ROOT}/common/Lookup.java`]: featureClass(
    'shop.common',
    'Lookup',
    '  public static String name() throws java.sql.SQLException {\n    try (java.sql.Connection connection = java.sql.DriverManager.getConnection("jdbc:none")) {\n      return connection.getCatalog();\n    }\n  }',
  ),
  [`${ROOT}/features/billing/InvoiceStore.java`]: featureClass(
    'shop.features.billing',
    'InvoiceStore',
    '  public java.sql.Connection open() throws java.sql.SQLException {\n    return java.sql.DriverManager.getConnection("jdbc:none");\n  }',
  ),
  [`${ROOT}/features/shipping/Label.java`]: featureClass(
    'shop.features.shipping',
    'Label',
    '  public Object store() {\n    return new shop.features.billing.InvoiceStore();\n  }',
  ),
};
