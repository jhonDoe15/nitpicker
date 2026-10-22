import { set, SPRING, under } from './spring-names.mjs';

const CLIENT = `${SPRING}.web.client`;
export const REST_TEMPLATE = set(`${CLIENT}.RestTemplate`);
export const REST_TEMPLATE_BUILDER = set(
  `${SPRING}.boot.web.client.RestTemplateBuilder`,
  `${SPRING}.boot.restclient.RestTemplateBuilder`,
);
export const REST_CLIENT = set(`${CLIENT}.RestClient`);
export const WEB_CLIENT = set(`${SPRING}.web.reactive.function.client.WebClient`);
export const JDK_HTTP_CLIENT = set('java.net.http.HttpClient');
export const NETTY_HTTP_CLIENT = set('reactor.netty.http.client.HttpClient');
export const REQUEST_FACTORIES = set(
  ...under(
    `${SPRING}.http.client`,
    'SimpleClientHttpRequestFactory',
    'HttpComponentsClientHttpRequestFactory',
  ),
);
export const REACTOR_CONNECTOR = set(`${SPRING}.http.client.reactive.ReactorClientHttpConnector`);
export const POST_CONSTRUCT_TARGETS = set(
  ...under(`${SPRING}.jdbc.core`, 'JdbcOperations', 'JdbcTemplate'),
  ...under(
    `${SPRING}.jdbc.core.namedparam`,
    'NamedParameterJdbcOperations',
    'NamedParameterJdbcTemplate',
  ),
  `${SPRING}.jdbc.core.simple.JdbcClient`,
  ...under(CLIENT, 'RestOperations', 'RestTemplate', 'RestClient'),
  `${SPRING}.web.reactive.function.client.WebClient`,
  'java.net.http.HttpClient',
);
export const JDBC_TARGETS = set(
  ...under(`${SPRING}.jdbc.core`, 'JdbcOperations', 'JdbcTemplate'),
  ...under(
    `${SPRING}.jdbc.core.namedparam`,
    'NamedParameterJdbcOperations',
    'NamedParameterJdbcTemplate',
  ),
);
export const JDBC_CLIENT = set(`${SPRING}.jdbc.core.simple.JdbcClient`);
export const LOGGERS = set(
  'org.slf4j.Logger',
  'org.apache.commons.logging.Log',
  'org.apache.logging.log4j.Logger',
  'java.util.logging.Logger',
  'java.lang.System.Logger',
  'mu.KLogger',
  'io.github.oshai.kotlinlogging.KLogger',
);
export const LOCKS = set(
  ...under('java.util.concurrent.locks', 'Lock', 'ReentrantLock', 'StampedLock'),
);
