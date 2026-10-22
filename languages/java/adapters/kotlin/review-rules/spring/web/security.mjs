import { annotationIn, argumentOf, stringValue, stringValues } from '../spring-names.mjs';
import { symbolOf } from '../spring-scopes.mjs';
import { CROSS_ORIGIN } from '../spring-types.mjs';

const PASSWORD = 'org.springframework.security.crypto.password';
const ENCODERS = new Set(
  [
    'NoOpPasswordEncoder',
    'MessageDigestPasswordEncoder',
    'Md4PasswordEncoder',
    'LdapShaPasswordEncoder',
    'StandardPasswordEncoder',
  ].map((name) => `${PASSWORD}.${name}`),
);
const USER = new Set(['org.springframework.security.core.userdetails.User']);
const ORIGIN_SETTERS = new Set([
  'setAllowedOrigins',
  'setAllowedOriginPatterns',
  'allowedOrigins',
  'allowedOriginPatterns',
  'addAllowedOrigin',
  'addAllowedOriginPattern',
]);
const CREDENTIALS = new Set(['setAllowCredentials', 'allowCredentials']);
const TRUE = /^(?:true|(?:java\.lang\.)?Boolean\.TRUE)$/u;
const EVERYTHING = new Set(['/**', '/*', '**']);
const MATCHERS = new Set(['requestMatchers', 'antMatchers', 'mvcMatchers', 'pathMatchers']);
const SCOPES = new Set(['securityMatcher', 'securityMatchers']);
const LOGINS = new Set(['formLogin', 'httpBasic', 'rememberMe', 'oauth2Login', 'saml2Login']);
const USER_BUILDER = /\bUser\s*\.\s*(?:withUsername|builder|withUserDetails)\b|\bwithUser\s*\(/u;
const ENCODED = /^[\w.]*encode\s*\((.*)\)$/su;

function finding(rule, view, invocation) {
  return { rule, line: invocation.line, symbol: symbolOf(view, invocation.scope, invocation.name) };
}

function sameFunction(view, invocation) {
  const fn = view.functionAt(invocation.scope);
  return view.file.invocations.filter((other) => view.functionAt(other.scope) === fn);
}

function corsWildcards(view) {
  const calls = view.file.invocations
    .filter((invocation) => ORIGIN_SETTERS.has(invocation.name))
    .filter((invocation) =>
      invocation.arguments.some(({ text }) => stringValues(text).includes('*')),
    )
    .filter((invocation) =>
      sameFunction(view, invocation).some(
        (other) =>
          CREDENTIALS.has(other.name) && other.arguments.some(({ text }) => TRUE.test(text)),
      ),
    )
    .map((invocation) => finding('SpringCorsWildcard', view, invocation));
  const annotations = [...view.file.classes, ...view.file.functions].flatMap((declared) => {
    const cross = annotationIn(
      view.resolve,
      declared.annotationEntries ?? declared.annotations ?? [],
      CROSS_ORIGIN,
    );
    const origins = (cross?.arguments ?? [])
      .filter(({ name }) => [undefined, 'value', 'origins', 'originPatterns'].includes(name))
      .flatMap(({ text }) => stringValues(text));
    return cross !== undefined &&
      stringValue(argumentOf(cross, 'allowCredentials')) === 'true' &&
      origins.includes('*')
      ? [
          {
            rule: 'SpringCorsWildcard',
            line: declared.line,
            symbol: declared.qualified ?? `${declared.owner}.${declared.name}`,
          },
        ]
      : [];
  });
  return [...calls, ...annotations];
}

function passwordEncoders(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        (invocation.receiver === undefined && view.is(invocation.name, ENCODERS)) ||
        (invocation.receiver !== undefined && view.is(invocation.receiver, ENCODERS)) ||
        (invocation.name === 'withDefaultPasswordEncoder' && view.is(invocation.receiver, USER)),
    )
    .map((invocation) => finding('SpringPasswordEncoder', view, invocation));
}

function everything(text) {
  const value = stringValue(text);
  return value !== undefined && EVERYTHING.has(value);
}

function matchesAll(call) {
  return (
    MATCHERS.has(call?.name) &&
    call.arguments.some(({ text }) => everything(text)) &&
    !call.arguments.some(({ text }) => text.includes('HttpMethod'))
  );
}

function permitAll(view) {
  return view.file.invocations
    .filter((invocation) => {
      const previous = invocation.previous;
      const chained =
        invocation.name === 'permitAll' &&
        (['anyRequest', 'anyExchange'].includes(previous?.name) || matchesAll(previous));
      const [target, access] = invocation.arguments;
      const dsl =
        invocation.name === 'authorize' &&
        access?.text === 'permitAll' &&
        (['anyRequest', 'anyExchange'].includes(target?.text) || everything(target?.text));
      return (
        (chained || dsl) && !sameFunction(view, invocation).some(({ name }) => SCOPES.has(name))
      );
    })
    .concat(
      view.file.invocations.filter(
        (invocation) =>
          invocation.previous?.name === 'ignoring' &&
          ['requestMatchers', 'antMatchers', 'mvcMatchers'].includes(invocation.name) &&
          invocation.arguments.some(({ text }) => everything(text)),
      ),
    )
    .map((invocation) => finding('SpringPermitAllAnyRequest', view, invocation));
}

function disabledIn(view, invocation) {
  return (
    invocation.arguments.some(({ text }) => text.endsWith('::disable')) ||
    (invocation.after ?? [])[0] === 'disable' ||
    view.file.invocations.some(
      (other) =>
        other.name === 'disable' &&
        other.line >= invocation.line &&
        view.chain(other.scope).find(({ k }) => k === 'lambda')?.host === invocation.name &&
        view.functionAt(other.scope) === view.functionAt(invocation.scope),
    )
  );
}

function argumentsText(call) {
  return call.arguments.map((argument) => argument.text).join(' ');
}

function statelessChain(view, invocation) {
  const calls = sameFunction(view, invocation);
  const stateless = calls.some(
    (call) => call.name === 'sessionCreationPolicy' && /STATELESS/u.test(argumentsText(call)),
  );
  const noContext = calls.some(
    (call) =>
      ['securityContext', 'securityContextRepository'].includes(call.name) &&
      /NullSecurityContextRepository|NoOpServerSecurityContextRepository/u.test(
        argumentsText(call),
      ),
  );
  const resourceServer =
    calls.some(({ name }) => name === 'oauth2ResourceServer') &&
    calls.some(({ name }) => ['jwt', 'opaqueToken'].includes(name)) &&
    calls.filter(({ name }) => LOGINS.has(name)).every((login) => disabledIn(view, login));
  return stateless || noContext || resourceServer;
}

function csrfDisabled(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        invocation.name === 'csrf' && invocation.assign !== true && disabledIn(view, invocation),
    )
    .filter((invocation) => !statelessChain(view, invocation))
    .map((invocation) => finding('SpringCsrfDisabled', view, invocation));
}

function literalNames(view, invocation) {
  const scopes = new Set(view.chain(invocation.scope).map(({ id }) => id));
  return new Set([
    ...view.file.literals.filter(({ scope }) => scopes.has(scope)).map(({ name }) => name),
    ...view.file.properties.filter(({ literal }) => literal === true).map(({ name }) => name),
  ]);
}

function literalPassword(view, invocation) {
  const [first] = invocation.arguments;
  if (first === undefined) {
    return false;
  }
  const value = ENCODED.exec(first.text)?.[1]?.trim() ?? first.text;
  return stringValue(value) !== undefined || literalNames(view, invocation).has(value.trim());
}

function hardcodedUsers(view) {
  return view.file.invocations
    .filter(
      (invocation) =>
        invocation.name === 'password' &&
        USER_BUILDER.test(invocation.receiver ?? '') &&
        literalPassword(view, invocation),
    )
    .map((invocation) => finding('SpringHardcodedUser', view, invocation));
}

export const SECURITY_RULES = [
  corsWildcards,
  passwordEncoders,
  permitAll,
  csrfDisabled,
  hardcodedUsers,
];
