const HOST_RULE = 'HostPortColonSplit';

const HOST_MESSAGES = {
  [HOST_RULE]:
    'Parse the host with `URI("http://$host")` (`host` and `port`), or cut after the closing bracket: ' +
    '`substringBefore(":")`, `substringAfter(":")` and `split(":")` on a host break IPv6 literals such ' +
    'as `[::1]:3000`, whose colons make the host `[` and lose the port. A value that is known not to be ' +
    'an IPv6 address takes an exception.',
};

const COLON_CALL = /\.\s*(?:split|substringBefore|substringAfter)\s*\(\s*(["'])[ ]*\1/g;
const COLON_ARGUMENT = /^\.\s*(?:split|substringBefore|substringAfter)\s*\(\s*(?:":"|':')/;
const HOST_RECEIVER = new RegExp(
  [
    String.raw`(?:(?<![\w$])(?:host|hostname|authority|origin|[a-z0-9]+Host)`,
    String.raw`|(?:getHeader|getHeaderString|header|get|first|headers)\s*[\[(]\s*`,
    String.raw`"(?:[Hh]ost|[Xx]-[Ff]orwarded-[Hh]ost|:authority)"\s*[\])])`,
    String.raw`\s*(?:\?|!!)?\s*$`,
  ].join(''),
);
const IPV6_AWARE = /isIPv6|ipv6|IPv6|"\["|"\]"/;
const RECEIVER_WINDOW = 120;

export function hostPortSplits(scanned) {
  const { code, source } = scanned;
  if (IPV6_AWARE.test(source)) {
    return [];
  }
  return [...code.matchAll(COLON_CALL)].flatMap((match) => {
    const end = match.index + match[0].length;
    const receiver = source.slice(Math.max(0, match.index - RECEIVER_WINDOW), match.index);
    return COLON_ARGUMENT.test(source.slice(match.index, end)) &&
      HOST_RECEIVER.test(receiver.replace(/^[\s\S]*\n/, ''))
      ? [{ rule: HOST_RULE, offset: match.index }]
      : [];
  });
}

export const kotlinSourceRules = { messages: HOST_MESSAGES, main: [hostPortSplits] };
