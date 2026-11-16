import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { untrimmedRequestTextProblems } from './untrimmed-request-text.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function problems(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-request-text-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return untrimmedRequestTextProblems(root, ['src/main/java', 'src/main/kotlin']).map(
    ({ path: file, line, key }) => `${file}:${String(line)} ${key}`,
  );
}

const OWNER = 'src/main/java/demo/OwnerController.java';
const owners = (body, extra = '') =>
  [
    'package demo;',
    '@Controller',
    'class OwnerController {',
    '  @GetMapping("/owners")',
    `  String processFindForm(@RequestParam(defaultValue = "1") int page, Owner owner, BindingResult result) {`,
    body,
    '    return "owners";',
    '  }',
    extra,
    '  private Page<Owner> findPaginated(int page, String lastname) {',
    '    return this.owners.findByLastNameStartingWith(lastname, PageRequest.of(page, 5));',
    '  }',
    '}',
  ].join('\n');

const PETCLINIC = [
  '    String lastName = owner.getLastName();',
  '    if (lastName == null) {',
  '      lastName = "";',
  '    }',
  '    Page<Owner> found = findPaginated(page, lastName);',
].join('\n');

describe('untrimmed-request-text', () => {
  it('reports the petclinic owner search that hands the form field to a finder', () => {
    expect(problems({ [OWNER]: owners(PETCLINIC) })).toEqual([`${OWNER}:5 processFindForm.owner`]);
  });

  it('is quiet once the text is stripped', () => {
    const fixed = PETCLINIC.replace('    }\n', '    }\n    lastName = lastName.strip();\n');
    expect(problems({ [OWNER]: owners(fixed) })).toEqual([]);
  });

  it('is quiet when one StringTrimmerEditor is registered', () => {
    const advice = [
      'package demo;',
      '@ControllerAdvice',
      'class Binding {',
      '  @InitBinder',
      '  void trim(WebDataBinder binder) {',
      '    binder.registerCustomEditor(String.class, new StringTrimmerEditor(true));',
      '  }',
      '}',
    ].join('\n');
    expect(
      problems({ [OWNER]: owners(PETCLINIC), 'src/main/java/demo/Binding.java': advice }),
    ).toEqual([]);
  });

  it('is quiet when the field never reaches a lookup', () => {
    expect(
      problems({ [OWNER]: owners('    model.addAttribute("name", owner.getLastName());') }),
    ).toEqual([]);
  });

  it('reports a request parameter given to a text finder and spares identifiers', () => {
    const controller = [
      'package demo;',
      '@RestController',
      'class UserController {',
      '  @GetMapping("/users")',
      '  List<User> search(@RequestParam String name, @RequestParam String userId, @RequestParam("n") String other) {',
      '    repository.findByUserId(userId);',
      '    repository.findByEmailContaining(other.trim());',
      '    return repository.findByNameStartingWithIgnoreCase(name);',
      '  }',
      '}',
    ].join('\n');
    expect(problems({ 'src/main/java/demo/UserController.java': controller })).toEqual([
      'src/main/java/demo/UserController.java:5 search.name',
    ]);
  });

  it('reads Kotlin handlers', () => {
    const controller = [
      'package demo',
      '@RestController',
      'class UserController(private val repository: UserRepository) {',
      '  @GetMapping("/users")',
      '  fun search(@RequestParam name: String?, @RequestParam other: String): List<User> {',
      '    repository.findByEmail(other.trim())',
      '    return repository.findByNameContaining(name!!)',
      '  }',
      '}',
    ].join('\n');
    expect(problems({ 'src/main/kotlin/demo/UserController.kt': controller })).toEqual([
      'src/main/kotlin/demo/UserController.kt:5 search.name',
    ]);
  });

  it('lets a controller own binder clear only that controller', () => {
    const own = owners(PETCLINIC).replace(
      '  @GetMapping',
      [
        '  @InitBinder',
        '  void trim(WebDataBinder b) {',
        '    b.registerCustomEditor(String.class, new StringTrimmerEditor(true));',
        '  }',
        '  @GetMapping',
      ].join('\n'),
    );
    const other = [
      'package demo;',
      '@Controller',
      'class VetController {',
      '  @GetMapping("/vets")',
      '  String find(@RequestParam String name) {',
      '    return repository.findByNameContaining(name);',
      '  }',
      '}',
    ].join('\n');
    expect(problems({ [OWNER]: own, 'src/main/java/demo/VetController.java': other })).toEqual([
      'src/main/java/demo/VetController.java:5 find.name',
    ]);
  });

  it('reads record accessors and grouping parentheses', () => {
    const body = '    Page<Owner> found = findPaginated(page, ((owner.lastName())));';
    expect(problems({ [OWNER]: owners(body) })).toEqual([`${OWNER}:5 processFindForm.owner`]);
  });
});
