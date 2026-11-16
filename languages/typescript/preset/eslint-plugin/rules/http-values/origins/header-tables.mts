function only([first, ...rest]: readonly [RegExp, ...RegExp[]]): RegExp {
  const alternation = rest.reduce(
    (pattern, part) => new RegExp(`${pattern.source}|${part.source}`),
    first,
  );
  return new RegExp(`^(?:${alternation.source})$`);
}
const FORWARDED = /forwarded/;
const ACCEPT = /accept(?:-(?:charset|encoding|language))?/;

export const VALUE_HEADERS = only([
  ACCEPT,
  /content-(?:type|encoding|language|disposition)/,
  /transfer-encoding/,
  /connection/,
  /upgrade/,
  /cache-control/,
  /pragma/,
  /(?:proxy-)?authorization/,
  /www-authenticate/,
  /expect/,
  /te/,
  /host/,
  /origin/,
  FORWARDED,
  /x-forwarded-(?:proto|host|scheme)/,
  /sec-fetch-\w+/,
  /vary/,
]);

export const STRUCTURED_HEADERS = only([
  ACCEPT,
  /content-(?:type|disposition|language)/,
  /cache-control/,
  /if-none-match/,
  /if-match/,
  /cookie/,
  /set-cookie/,
  FORWARDED,
  /vary/,
  /prefer/,
  /link/,
]);

export const HEADER_BAG = /^\w*[hH]eaders$/;
export const REQUEST_LIKE = /^(?:req|request|ctx|context|c|\w*Req|\w*Request)$/;
export const GETTER_OWNER = /^(?:req|request|ctx|context|c)$/;
export const URL_LIKE = /^(?:url|uri|location|\w*Url|\w*Uri)$/;
