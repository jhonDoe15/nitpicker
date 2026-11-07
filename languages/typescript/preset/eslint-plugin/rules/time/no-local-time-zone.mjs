import { constructorProblem, dateMethodProblem, intlProblem, parseProblem } from './date-calls.mjs';
import { dateFnsProblem, dayjsProblem, luxonProblem } from './library-calls.mjs';

const ZONE_EFFECT = "the result changes with the server's `TZ`";

const CALL_CHECKS = [
  dateMethodProblem,
  intlProblem,
  parseProblem,
  luxonProblem,
  dateFnsProblem,
  dayjsProblem,
];
const NEW_CHECKS = [constructorProblem, intlProblem];

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow dates computed or formatted in the server's local time zone",
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      localDateMethod: `\`{{ name }}()\` uses the server's local time zone, so ${ZONE_EFFECT}. Use \`{{ utc }}()\`, or compute in an explicit zone (luxon \`DateTime.fromJSDate(date, { zone })\`).`,
      localOffset: `\`{{ name }}()\` is the offset of the server's local time zone, so ${ZONE_EFFECT}. Take the offset of an explicit zone (luxon \`DateTime.now().setZone(zone).offset\`).`,
      localString: `\`{{ name }}()\` prints the date in the server's local time zone, so ${ZONE_EFFECT}. Use \`toISOString()\`, or \`Intl.DateTimeFormat\` with a \`timeZone\`.`,
      localeWithoutZone: `\`{{ name }}\` without a \`timeZone\` option formats in the server's local time zone, so ${ZONE_EFFECT}. Pass the zone: \`date.{{ name }}('en-US', { timeZone: 'UTC' })\`, or the user's zone.`,
      intlWithoutZone: `\`Intl.DateTimeFormat\` without a \`timeZone\` option formats in the server's local time zone, so ${ZONE_EFFECT}. Pass the zone: \`new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })\`, or the user's zone.`,
      serverZoneName: `\`Intl.DateTimeFormat().resolvedOptions().timeZone\` is the server's own zone, so ${ZONE_EFFECT}. Use a configured zone name or \`'UTC'\`.`,
      localConstructor: `\`new Date(year, month, ...)\` builds the date in the server's local time zone, so ${ZONE_EFFECT}. Use \`new Date(Date.UTC(year, month, ...))\`.`,
      localParse: `This date-time text has no offset, so it is read in the server's local time zone and ${ZONE_EFFECT}. Add \`Z\` or an offset (\`'2024-01-01T10:00:00Z'\`), or parse it in an explicit zone (luxon \`DateTime.fromISO(text, { zone })\`).`,
      luxonLocal: `luxon \`{{ name }}\` without a \`zone\` option uses the server's local time zone, so ${ZONE_EFFECT}. Pass \`{ zone: 'utc' }\` (or the user's zone), chain \`.setZone(zone)\`, or use \`DateTime.utc()\`.`,
      dateFnsLocal: `date-fns \`{{ name }}\` works in the server's local time zone, so ${ZONE_EFFECT}. Pass the zone with \`{ in: tz('UTC') }\` from \`@date-fns/tz\`, or use \`formatInTimeZone\` from \`date-fns-tz\`.`,
      dayjsLocal: `\`{{ name }}\` builds a date in the server's local time zone, so ${ZONE_EFFECT}. Chain \`.utc()\` or \`.tz(zone)\` before calendar methods like \`format\`, \`startOf\` or \`add\`, or start from \`.utc(...)\`.`,
    },
  },
  create(context) {
    function check(node, checks) {
      const problem = checks
        .map((find) => find(context, node))
        .find((found) => found !== undefined);
      if (problem !== undefined) {
        context.report({ node, ...problem });
      }
    }
    return {
      CallExpression(node) {
        check(node, CALL_CHECKS);
      },
      NewExpression(node) {
        check(node, NEW_CHECKS);
      },
    };
  },
};
