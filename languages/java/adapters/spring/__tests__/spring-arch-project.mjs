import path from 'node:path';

export const SPRING_ARCH_FIXTURE = path.join(
  path.resolve(import.meta.dirname, '..'),
  '..',
  'fixtures',
  'spring-arch-project',
);

export const SPRING_ARCH_VIOLATIONS = [
  'spring-controller-entity shop.orders.OrderController all:shop.orders.Order',
  'spring-controller-entity shop.orders.OrderController create:shop.orders.Order',
  'spring-controller-entity shop.orders.OrdersApiController list:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController base:shop.orders.Order',
  'spring-controller-entity shop.orders.ReportController model:shop.orders.Order',
  'spring-controller-repository shop.customers.CustomerController shop.orders.OrderRepository',
  'spring-controller-repository shop.orders.OrderController shop.orders.OrderRepository',
  'spring-feature-boundary shop.billing.BillingService shop.orders.internal.Audit',
  'spring-feature-boundary shop.billing.Invoices shop.web.internal.Formats',
  'spring-layout shop.Helper ',
  'spring-layout shop.service.Legacy service',
  'spring-layout shop.util.Strings util',
  'spring-no-dirties-context shop.OrderFlowTest ',
  'spring-no-dirties-context shop.orders.integration.CheckoutIT ',
  'spring-service-web shop.billing.BillingService org.springframework.http.ResponseEntity',
  'spring-shared-pure shop.shared.Clocked ',
  'spring-shared-pure shop.shared.Totals shop.orders.OrderDto',
  'spring-test-placement shop.OrderFlowTest ',
  'spring-test-placement shop.orders.ComposedTest ',
  'spring-test-placement shop.orders.ExtendedTest ',
  'spring-test-placement shop.orders.InheritedTest ',
  'spring-test-placement shop.orders.RepositoryTest ',
];
