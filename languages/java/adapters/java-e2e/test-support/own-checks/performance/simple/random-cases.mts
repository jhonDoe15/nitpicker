import { simpleCase } from './simple-case.mts';

const UTIL_RANDOM = 'java.util.Random';

const CHECK = 'DMI_RANDOM_USED_ONLY_ONCE';
const CURRENT = 'ThreadLocalRandom.current()';

export const RANDOM_CASES = [
  simpleCase({
    check: CHECK,
    name: 'RandomJitter',
    imports: [
      UTIL_RANDOM,
      'java.util.concurrent.ScheduledExecutorService',
      'java.util.concurrent.TimeUnit',
    ],
    importsAfter: [
      'java.util.concurrent.ScheduledExecutorService',
      'java.util.concurrent.ThreadLocalRandom',
      'java.util.concurrent.TimeUnit',
    ],
    parameters: 'ScheduledExecutorService scheduler, Runnable task, long period',
    statements: [
      [
        'scheduler.scheduleAtFixedRate(task, new Random().nextInt((int) period), period, TimeUnit.MILLISECONDS);',
        `scheduler.scheduleAtFixedRate(task, ${CURRENT}.nextInt((int) period), period, TimeUnit.MILLISECONDS);`,
      ],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'RandomDraws',
    imports: [UTIL_RANDOM],
    importsAfter: ['java.util.concurrent.ThreadLocalRandom'],
    parameters: 'byte[] data',
    statements: [
      ['int any = new Random().nextInt();', `int any = ${CURRENT}.nextInt();`],
      ['int digit = new Random().nextInt(10);', `int digit = ${CURRENT}.nextInt(10);`],
      ['long below = new Random().nextLong(100);', `long below = ${CURRENT}.nextLong(100);`],
      ['double ratio = new Random().nextDouble();', `double ratio = ${CURRENT}.nextDouble();`],
      ['boolean coin = new Random().nextBoolean();', `boolean coin = ${CURRENT}.nextBoolean();`],
      ['new Random().nextBytes(data);', `${CURRENT}.nextBytes(data);`],
      ['int ranged = (new Random()).nextInt(5, 9);', `int ranged = ${CURRENT}.nextInt(5, 9);`],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'RandomKept',
    imports: ['java.security.SecureRandom', UTIL_RANDOM, 'java.util.stream.IntStream'],
    members: [['private final Random shared = new Random();']],
    parameters: 'long seed',
    statements: [
      ['int seeded = new Random(42).nextInt();'],
      ['int fromField = shared.nextInt();'],
      ['int subclass = new Random() {}.nextInt();'],
      ['Random stored = new Random();'],
      ['int twice = stored.nextInt() + stored.nextInt();'],
      ['IntStream stream = new Random().ints(3);'],
      ['int secure = new SecureRandom().nextInt();'],
      ['new Random().setSeed(seed);'],
    ],
  }),
];
