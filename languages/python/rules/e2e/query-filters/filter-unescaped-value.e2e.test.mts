import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'module-level-mutable-state', 'regex-unescaped-value'],
});

const LDAP_ONLY = ['import ldap3', '', ''];
const LDAP3 = ['import ldap3', 'from ldap3.utils.conv import escape_filter_chars', '', ''];

describe.skipIf(!enabled)('filter-unescaped-value', () => {
  itOutcomes('flags a value built into an LDAP filter without escaping', [
    [
      'an f-string filter with a group DN',
      code(
        ...LDAP3,
        'def members(conn, base, member_attr, group_dn):',
        '    search_filter = f"({member_attr}={group_dn})"',
        '    conn.search(base, search_filter)',
      ),
      ['filter-unescaped-value:6 ldap|group_dn'],
    ],
    [
      'a filter passed straight to a python-ldap search',
      code(
        'import ldap',
        '',
        '',
        'def find(conn, base, username):',
        '    return conn.search_s(base, ldap.SCOPE_SUBTREE, f"(&(objectClass=person)(uid={username}))")',
      ),
      ['filter-unescaped-value:5 ldap|username'],
    ],
    [
      'percent formatting and str.format',
      code(
        'import ldap',
        '',
        '',
        'def find(conn, base, name, mail):',
        '    first = conn.search_s(base, 2, "(cn=%s)" % name)',
        '    second = conn.search_s(base, 2, filterstr="(mail={})".format(mail))',
        '    return first, second',
      ),
      ['filter-unescaped-value:5 ldap|name', 'filter-unescaped-value:6 ldap|mail'],
    ],
    [
      'a value read from an object that came in as a parameter',
      code(
        ...LDAP3,
        'def lookup(conn, base, user):',
        '    conn.search(base, f"(sAMAccountName={user.username})")',
      ),
      ['filter-unescaped-value:6 ldap|user.username'],
    ],
    [
      'a value held in a local variable',
      code(
        ...LDAP3,
        'def lookup(conn, base, user):',
        '    name = user.name',
        '    conn.search(base, search_filter=f"(cn={name})")',
      ),
      ['filter-unescaped-value:7 ldap|name'],
    ],
    [
      'only the value after the equals sign is named when the attribute is a parameter too',
      code(
        ...LDAP3,
        'def members(conn, base, attr, dn):',
        '    conn.search(base, f"(&(objectClass=group)({attr}={dn}))")',
      ),
      ['filter-unescaped-value:6 ldap|dn'],
    ],
    [
      'a parameter rebound to a value that is still raw',
      code(
        ...LDAP3,
        'def lookup(conn, base, username):',
        '    username = username.strip()',
        '    conn.search(base, f"(uid={username})")',
      ),
      ['filter-unescaped-value:7 ldap|username'],
    ],
  ]);

  itOutcomes('flags a value built into a SCIM filter without quoting', [
    [
      'an unquoted user name in the filter parameter',
      code(
        'import requests',
        '',
        '',
        'def find(session, username):',
        '    params = {"filter": f"userName eq {username}"}',
        '    return session.get("/Users", params=params)',
      ),
      ['filter-unescaped-value:5 scim|username'],
    ],
    [
      'a quoted value that is not escaped',
      code(
        'def conflict(session, name):',
        '    return session.get("/Groups", params={"filter": f\'displayName eq "{name}"\'})',
      ),
      ['filter-unescaped-value:2 scim|name'],
    ],
    [
      'a filter keyword with a contains clause',
      code('def search(client, term):', '    return client.list(filter="userName co " + term)'),
      ['filter-unescaped-value:2 scim|term'],
    ],
  ]);

  itOutcomes('stays quiet for escaped values, constants and other strings', [
    [
      'escape_filter_chars around the value',
      code(
        ...LDAP3,
        'def members(conn, base, member_attr, group_dn):',
        '    search_filter = f"({member_attr}={escape_filter_chars(group_dn)})"',
        '    conn.search(base, search_filter)',
      ),
      [],
    ],
    [
      'ldap.filter.escape_filter_chars and filter_format',
      code(
        'import ldap',
        'import ldap.filter',
        '',
        '',
        'def find(conn, base, username, mail):',
        '    safe = ldap.filter.escape_filter_chars(username)',
        '    first = conn.search_s(base, 2, f"(uid={ldap.filter.escape_filter_chars(username)})")',
        '    second = conn.search_s(base, 2, ldap.filter.filter_format("(mail=%s)", [mail]))',
        '    return first, second, safe',
      ),
      [],
    ],
    [
      'a filter made only of constants and module names',
      code(
        ...LDAP_ONLY,
        'GROUP = "admins"',
        '',
        '',
        'def members(conn, base):',
        '    conn.search(base, f"(&(objectClass=group)(cn={GROUP}))")',
      ),
      [],
    ],
    [
      'an attribute name that is a parameter and a constant value',
      code(...LDAP_ONLY, 'def lookup(conn, base, attr):', '    conn.search(base, f"({attr}=*)")'),
      [],
    ],
    [
      'a number parameter',
      code(
        ...LDAP_ONLY,
        'def lookup(conn, base, uid: int):',
        '    conn.search(base, f"(uidNumber={uid})")',
      ),
      [],
    ],
    [
      'a filter shape in a file that does not use an LDAP library',
      code(
        'def lookup(db, name):',
        '    search_filter = f"(name={name})"',
        '    return db.run(search_filter)',
      ),
      [],
    ],
    [
      'a quoted and escaped SCIM value',
      code(
        'import json',
        '',
        '',
        'def find(session, username, name):',
        '    first = {"filter": f"userName eq {json.dumps(username)}"}',
        '    second = {"filter": f\'userName eq "{scim_quote(name)}"\'}',
        '    return session.get("/Users", params=first), session.get("/Users", params=second)',
      ),
      [],
    ],
    [
      'a SCIM filter made of constants',
      code(
        'def find(session):',
        '    return session.get("/Users", params={"filter": "userName eq \\"admin\\""})',
      ),
      [],
    ],
    [
      'a filter key that is not a SCIM clause',
      code(
        'def find(session, status):',
        '    return session.get("/items", params={"filter": f"status:{status}"})',
      ),
      [],
    ],
    [
      'a parameter rebound to its escaped value',
      code(
        'import ldap',
        'import ldap.filter',
        'import ldap3.utils.conv',
        'from ldap3.utils.conv import escape_filter_chars',
        '',
        '',
        'def one(conn, base, username):',
        '    username = escape_filter_chars(username)',
        '    return conn.search(base, f"(uid={username})")',
        '',
        '',
        'def two(conn, base, username):',
        '    username = ldap.filter.escape_filter_chars(username)',
        '    return conn.search_s(base, 2, f"(uid={username})")',
        '',
        '',
        'def three(conn, base, username):',
        '    username = ldap3.utils.conv.escape_filter_chars(username)',
        '    return conn.search(base, f"(uid={username})")',
      ),
      [],
    ],
    [
      'a SCIM parameter rebound with its quotes escaped',
      code(
        'def find(session, user_name):',
        "    user_name = user_name.replace('\"', '\\\\\"')",
        '    return session.get("/Users", params={"filter": f\'userName eq "{user_name}"\'})',
      ),
      [],
    ],
    [
      'a re.search call on an LDAP-shaped pattern',
      code(
        'import re',
        'import ldap3',
        '',
        '',
        'def match(text, name):',
        '    return re.search(f"(cn={name})", text)',
      ),
      [],
    ],
    [
      'a filter built at module level',
      code(...LDAP_ONLY, 'NAME = load_name()', 'search_filter = f"(cn={NAME})"'),
      [],
    ],
  ]);
});
