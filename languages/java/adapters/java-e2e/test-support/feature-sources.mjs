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
