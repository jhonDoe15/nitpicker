const MAIN = 'src/main/java/demo';

const HEAD = `package demo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;

public class LogShapes {
  private static final Logger LOG = LoggerFactory.getLogger(LogShapes.class);

  void shapes(Object[] ids, int[] counts, Marker marker, Exception failure, long total, char unit) {
`;

const TAIL = `  }
}
`;

const BEFORE = [
  '    LOG.info("ids " + ids);',
  '    LOG.error("ids " + ids, failure);',
  '    LOG.info("counts " + counts);',
  '    LOG.info(marker, "with marker " + total);',
  '    LOG.error("failed for " + total, failure);',
  '    LOG.info("sum " + (total + 1) + unit + \'x\' + 1 + true);',
  '    LOG.info(String.format("%s of %d", total, 3));',
  '    LOG.info("percent %s%%".formatted(total));',
  '    LOG.warn("failed " + failure);',
  '    LOG.info("brace " + \'{\' + total);',
  '    LOG.info("long %d".formatted(total));',
  '    LOG.info("both " + ids + total);',
];

const AFTER = [
  '    LOG.info("ids " + ids);',
  '    LOG.error("ids {}", ids, failure);',
  '    LOG.info("counts {}", counts);',
  '    LOG.info(marker, "with marker {}", total);',
  '    LOG.error("failed for {}", total, failure);',
  '    LOG.info("sum {}{}x1true", total + 1, unit);',
  '    LOG.info("{} of {}", total, 3);',
  '    LOG.info("percent {}%", total);',
  '    LOG.warn("failed " + failure);',
  '    LOG.info("brace " + \'{\' + total);',
  '    LOG.info("long %d".formatted(total));',
  '    LOG.info("both {}{}", ids, total);',
];

const FIRST_LINE = HEAD.split('\n').length;

export const LOG_CASES = [
  {
    check: 'LogStringConcatenation',
    file: `${MAIN}/LogShapes.java`,
    before: `${HEAD}${BEFORE.join('\n')}\n${TAIL}`,
    after: `${HEAD}${AFTER.join('\n')}\n${TAIL}`,
    lines: [FIRST_LINE + BEFORE.findIndex((line, index) => line !== AFTER[index])],
  },
];
