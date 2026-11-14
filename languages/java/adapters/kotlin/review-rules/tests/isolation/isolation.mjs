import { NETWORK_RULE } from '../../../../../messages/isolation/unit-tests.mjs';
import { clockReads, isFaked } from './clock/clock-reads.mjs';
import { isMeasuring } from './clock/measuring.mjs';
import { networkCalls } from './network/network-calls.mjs';
import { randomDraws } from './random/random-draws.mjs';
import { reportOf } from './report.mjs';

export const CLOCK_RULE = 'RealClockInTest';
export const RANDOM_RULE = 'RandomInTest';
export { NETWORK_RULE };
export const ISOLATION_RULES = [CLOCK_RULE, RANDOM_RULE, NETWORK_RULE];

const CLOCK = {
  rule: CLOCK_RULE,
  message:
    'This test reads the real clock, so its result depends on when it runs. Pass a fixed time in: a Clock.fixed(...) the subject takes, now(clock) with that clock, or a fixed Instant. Measuring elapsed time or a polling deadline is allowed: System.nanoTime() or TimeSource.Monotonic, a start time subtracted later, or now() compared in a loop.',
};
const RANDOM = {
  rule: RANDOM_RULE,
  message:
    'This test draws unseeded random values, so it can pass on one run and fail on the next. Use fixed values, or a seeded generator the subject takes: Random(42), list.random(random) or shuffled(random). Compare a fixed UUID (UUID.fromString(...)), not UUID.randomUUID().',
};
const NETWORK = {
  rule: NETWORK_RULE,
  message:
    'This unit test calls a real remote host, so it fails without the network and depends on that service. Give the subject a fake client, or point it at a local stub: MockWebServer, WireMock or MockRestServiceServer on localhost, or a Ktor MockEngine. A test that needs the real service is an integration test: an IT class, an integration source set or @SpringBootTest.',
};

export function isolationReports(scanned, { network = true } = {}) {
  const clock = isFaked(scanned)
    ? []
    : clockReads(scanned).filter((read) => !isMeasuring(scanned, read));
  return [
    ...clock.map((hit) => reportOf(scanned, CLOCK, hit)),
    ...randomDraws(scanned).map((hit) => reportOf(scanned, RANDOM, hit)),
    ...(network ? networkCalls(scanned) : []).map((hit) => reportOf(scanned, NETWORK, hit)),
  ];
}
