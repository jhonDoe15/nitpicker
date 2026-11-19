import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const DJANGO = ['from django.contrib.auth.decorators import permission_required', ''];

describe.skipIf(!enabled)('permission-name-without-app-label', () => {
  itOutcomes('flags a permission name without an app label', [
    [
      'has_perm with a bare codename',
      code(
        ...DJANGO,
        'def impersonate(request):',
        '    if request.user.has_perm("impersonate"):',
        '        return True',
      ),
      ['permission-name-without-app-label:4 has_perm()|impersonate'],
    ],
    [
      'has_perm with a bare codename and an object',
      code(
        ...DJANGO,
        'def search(user, provider):',
        '    return user.has_perm("search_full_directory", provider)',
      ),
      ['permission-name-without-app-label:4 has_perm()|search_full_directory'],
    ],
    [
      'has_perms with one bare name in the list',
      code(
        ...DJANGO,
        'def check(user):',
        '    return user.has_perms(["shop.add_order", "change_order"])',
      ),
      ['permission-name-without-app-label:4 has_perms()|change_order'],
    ],
    [
      'user_has_perm helper and keyword form',
      code(
        ...DJANGO,
        'def user_has_perm(user, perm):',
        '    return user.has_perm(perm)',
        '',
        '',
        'def check(user):',
        '    first = user_has_perm(user, "view_order")',
        '    return first or user.has_perm(perm="edit")',
      ),
      [
        'permission-name-without-app-label:8 user_has_perm()|view_order',
        'permission-name-without-app-label:9 has_perm()|edit',
      ],
    ],
    [
      'permission_required decorator',
      code(
        ...DJANGO,
        '@permission_required("view_order")',
        'def view(request):',
        '    return None',
      ),
      ['permission-name-without-app-label:3 permission_required()|view_order'],
    ],
    [
      'permission_required decorator with a list',
      code(
        ...DJANGO,
        '@permission_required(["shop.view_order", "export"], raise_exception=True)',
        'def view(request):',
        '    return None',
      ),
      ['permission-name-without-app-label:3 permission_required()|export'],
    ],
    [
      'PermissionRequiredMixin attribute',
      code(
        'from django.contrib.auth.mixins import PermissionRequiredMixin',
        'from django.views import View',
        '',
        '',
        'class Export(PermissionRequiredMixin, View):',
        '    permission_required = "export_orders"',
      ),
      ['permission-name-without-app-label:6 permission_required()|export_orders'],
    ],
    [
      'DRF model permissions mapping',
      code(
        'from rest_framework.permissions import DjangoModelPermissions',
        '',
        '',
        'class Perms(DjangoModelPermissions):',
        '    perms_map = {',
        '        "GET": ["view_order"],',
        '        "POST": ["%(app_label)s.add_%(model_name)s"],',
        '    }',
      ),
      ['permission-name-without-app-label:6 perms_map()|view_order'],
    ],
  ]);

  itOutcomes('stays quiet for the allowed forms and unrelated calls', [
    [
      'the app label form',
      code(
        ...DJANGO,
        '@permission_required("shop.view_order")',
        'def view(request):',
        '    return request.user.has_perm("shop.change_order", None)',
      ),
      [],
    ],
    [
      'a permission held in a variable',
      code(...DJANGO, 'def check(user, name):', '    return user.has_perm(name)'),
      [],
    ],
    [
      'a format placeholder name',
      code(...DJANGO, 'def check(user):', '    return user.has_perm("%s" % "x")'),
      [],
    ],
    [
      'a receiver that is not a user',
      code(...DJANGO, 'def check(acl):', '    return acl.has_perm("read")'),
      [],
    ],
    [
      'a project class with its own has_perm',
      code(
        ...DJANGO,
        'class Acl:',
        '    def has_perm(self, name):',
        '        return True',
        '',
        '',
        'def check(user: Acl):',
        '    return user.has_perm("read")',
      ),
      [],
    ],
    [
      'user_has_perm that is not defined or imported from Django',
      code(...DJANGO, 'def check(user):', '    return user_has_perm(user, "view_order")'),
      [],
    ],
    [
      'a mixin attribute with the app label',
      code(
        'from django.contrib.auth.mixins import PermissionRequiredMixin',
        '',
        '',
        'class Export(PermissionRequiredMixin):',
        '    permission_required = ("shop.export", "shop.view")',
      ),
      [],
    ],
    [
      'a permission_required attribute outside a mixin',
      code(
        'from django.db import models',
        '',
        '',
        'class Setting:',
        '    permission_required = "export"',
      ),
      [],
    ],
    [
      'a mapping on an unrelated class',
      code(
        'from django.db import models',
        '',
        '',
        'class Perms:',
        '    perms_map = {"GET": ["view_order"]}',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet outside a Django project', [
    [
      'a project without Django',
      code('def check(user):', '    return user.has_perm("impersonate")'),
      [],
    ],
  ]);

  itOutcomes('stays quiet in tests', [
    [
      'a test file',
      {
        file: 'tests/test_perm.py',
        code: code(
          ...DJANGO,
          'def test_perm(user):',
          '    assert not user.has_perm("impersonate")',
        ),
      },
      [],
    ],
  ]);

  itOutcomes('lets django-guardian take a bare codename with an object', [
    [
      'a guardian project with an object',
      {
        files: {
          'perms.py': code(
            'from guardian.shortcuts import assign_perm',
            ...DJANGO,
            'def check(user, provider):',
            '    return user.has_perm("search_full_directory", provider)',
          ),
        },
      },
      [],
    ],
    [
      'a guardian project without an object',
      {
        files: {
          'perms.py': code(
            'from guardian.shortcuts import assign_perm',
            ...DJANGO,
            'def check(user):',
            '    return user.has_perm("impersonate")',
          ),
        },
      },
      ['permission-name-without-app-label:5 has_perm()|impersonate'],
    ],
  ]);
});
