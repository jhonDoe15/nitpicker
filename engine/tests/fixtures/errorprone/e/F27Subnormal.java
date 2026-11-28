package e;

import java.math.BigDecimal;

class F27Subnormal {
    BigDecimal smallest = new BigDecimal(4.9e-324);
    BigDecimal twice = new BigDecimal(9.9e-324);
    double rounded = 5e-324;
    double plain = 1e-323;
    float tiny = 1.4e-45f;
    float rough = 1e-45f;
    float eight = 1.1e-44f;
}
