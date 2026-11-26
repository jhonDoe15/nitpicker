import { describe, expect, it } from 'vitest';
import { engineSpotbugsFindingOf, spotbugsResultOf } from './spotbugs-results.mts';

function resultOf(rule: string, message: string, symbol?: string) {
  return spotbugsResultOf({ file: '/src/p/q/A.java', rule, line: 7, message, symbol });
}

describe('spotbugsResultOf', () => {
  it('writes a returned field the way SpotBugs reports it', () => {
    const result = resultOf(
      'EI_EXPOSE_REP',
      'p.q.A$In.get() may expose internal representation by returning A.date',
    );

    expect(result).toStrictEqual({
      ruleId: 'EI_EXPOSE_REP',
      message: {
        id: 'default',
        text: 'May expose internal representation by returning reference to mutable object',
        arguments: ['p.q.A$In.get()', 'A.date'],
      },
      level: 'note',
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'p/q/A.java' },
            region: { startLine: 7 },
          },
          logicalLocations: [
            { name: 'A.date', kind: 'member', fullyQualifiedName: 'p.q.A$In.date' },
          ],
        },
      ],
    });
  });

  it('names the class of the method for a field of a class in another package', () => {
    const result = resultOf(
      'MS_EXPOSE_REP',
      'Public static p.q.A.get() may expose internal representation by returning r.B.list',
    );

    expect(result.message.arguments).toStrictEqual(['p.q.A.get()', 'r.B.list']);
    expect(result.locations[0].logicalLocations[0]).toStrictEqual({
      name: 'r.B.list',
      kind: 'member',
      fullyQualifiedName: 'p.q.A.list',
    });
  });

  it('names the stored variable the engine gives and a ? without one', () => {
    const message =
      'new p.q.A(Date) may expose internal representation by storing an externally mutable object into A.d';
    const named = resultOf('EI_EXPOSE_REP2', message, 'new p.q.A(Date)#when');
    const unnamed = resultOf('EI_EXPOSE_REP2', message);

    expect(named.locations[0].logicalLocations[0]).toStrictEqual({
      name: 'when',
      kind: 'variable',
      fullyQualifiedName: 'new p.q.A(Date)#when',
    });
    expect(unnamed.locations[0].logicalLocations[0].fullyQualifiedName).toBe('new p.q.A(Date)#?');
    expect(named.locations[0].physicalLocation.artifactLocation.uri).toBe('p/q/A.java');
  });

  it('writes a static store and a constructor that throws', () => {
    const stored = resultOf(
      'EI_EXPOSE_STATIC_REP2',
      'p.q.A.set(Date) may expose internal static state by storing a mutable object into a static field p.q.A.d',
      'p.q.A.set(Date)#d',
    );
    const thrown = resultOf(
      'CT_CONSTRUCTOR_THROW',
      'Exception thrown in class p.q.A$1 at new p.q.A$1(A, int) will leave the constructor. The object under ' +
        'construction remains partially initialized and may be vulnerable to Finalizer attacks.',
    );

    expect(stored.message.arguments).toStrictEqual(['p.q.A.set(Date)', 'p.q.A.d']);
    expect(thrown.message).toStrictEqual({
      id: 'default',
      text: 'Be wary of letting constructors throw exceptions.',
      arguments: ['p.q.A$1', 'new p.q.A$1(A, int)'],
    });
    expect(thrown.locations[0].logicalLocations[0]).toStrictEqual({
      name: 'new A$1(A, int)',
      kind: 'function',
      fullyQualifiedName: 'new p.q.A$1(A, int)',
    });
  });

  it('places a class of the default package at the source file name', () => {
    const result = spotbugsResultOf({
      file: '/src/A.java',
      rule: 'EI_EXPOSE_REP',
      line: 3,
      message: 'A.get() may expose internal representation by returning A.date',
      symbol: undefined,
    });

    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe('A.java');
    expect(result.locations[0].logicalLocations[0].fullyQualifiedName).toBe('A.date');
  });

  it.each([
    ['function:p.q.A$In.run(String)', 'function', 'run(String)', 'p/q/A.java'],
    ['function:new p.q.A$In(int)', 'function', 'new A$In(int)', 'p/q/A.java'],
    ['member:p.q.A$In.map', 'member', 'A$In.map', 'p/q/A.java'],
    ['variable:p.q.A.run(Lock)#lock', 'variable', 'lock', 'p/q/A.java'],
    ['function:Top.run()', 'function', 'run()', 'A.java'],
  ])('places %s the way SpotBugs SARIF names it', (symbol, kind, name, uri) => {
    const result = spotbugsResultOf({
      file: '/src/p/q/A.java',
      rule: 'WMI_WRONG_MAP_ITERATOR',
      line: 7,
      message: 'unused',
      symbol,
      priority: 2,
    });
    const qualified = symbol.slice(symbol.indexOf(':') + 1);

    expect(result.level).toBe('note');
    expect(result.message.text).toBe(
      'Inefficient use of keySet iterator instead of entrySet iterator',
    );
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe(uri);
    expect(result.locations[0].logicalLocations).toStrictEqual([
      { name, kind, fullyQualifiedName: qualified },
    ]);
  });

  it('refuses a placed finding without a place or with a priority it has no level for', () => {
    const finding = { file: '/A.java', rule: 'DCN_NULLPOINTER_EXCEPTION', line: 1, message: '' };

    expect(() => spotbugsResultOf({ ...finding, symbol: undefined, priority: 2 })).toThrow(
      /cannot place/u,
    );
    expect(() => spotbugsResultOf({ ...finding, symbol: 'function:p.A.a()', priority: 3 })).toThrow(
      /cannot place/u,
    );
  });

  it('lists the values the engine gives with the message', () => {
    const finding = {
      file: '/src/p/A.java',
      rule: 'PREDICTABLE_RANDOM',
      line: 5,
      message: '',
      symbol: 'function:p.A.a()',
      priority: 2,
      arguments: ['java.util.Random'],
    };

    expect(spotbugsResultOf(finding).message.arguments).toStrictEqual(['java.util.Random']);
    expect(spotbugsResultOf({ ...finding, arguments: undefined }).message.arguments).toStrictEqual([
      'p.A.a()',
    ]);
    expect(engineSpotbugsFindingOf(finding).arguments).toStrictEqual(['java.util.Random']);
  });

  it('names the class in the place where SpotBugs does', () => {
    const finding = {
      file: '/src/p/K.java',
      rule: 'CN_IDIOM_NO_SUPER_CALL',
      line: 5,
      message: '',
      symbol: 'function:p.K.clone()',
      arguments: ['p.K.clone()'],
    };

    const first = spotbugsResultOf({ ...finding, priority: 1 });
    const second = spotbugsResultOf({ ...finding, priority: 2 });

    expect(first.message.arguments).toStrictEqual(['p.K.clone()']);
    expect([first.level, first.locations[0].logicalLocations[0].name]).toStrictEqual([
      'warning',
      'K.clone()',
    ]);
    expect([second.level, second.locations[0].logicalLocations[0].name]).toStrictEqual([
      'note',
      'clone()',
    ]);
    expect(
      engineSpotbugsFindingOf({ ...finding, arguments: ['p.K', 'p.K.clone()'] }).arguments,
    ).toStrictEqual(['p.K', 'p.K.clone()']);
  });

  it('places a finding on the file of the class it names first', () => {
    const result = spotbugsResultOf({
      file: '/src/p/Sub.java',
      rule: 'EQ_DOESNT_OVERRIDE_EQUALS',
      line: 1,
      message: '',
      symbol: 'function:q.Base.equals(Object)',
      priority: 2,
      arguments: ['p.Sub', 'q.Base.equals(Object)'],
    });

    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe('p/Sub.java');
    expect(result.locations[0].logicalLocations).toStrictEqual([
      {
        name: 'q.Base.equals(Object)',
        kind: 'function',
        fullyQualifiedName: 'q.Base.equals(Object)',
      },
    ]);
  });

  it('drops the package from the name only when the hidden class shares it', () => {
    const finding = {
      file: '/src/p/B.java',
      rule: 'HSM_HIDING_METHOD',
      line: 4,
      message: '',
      priority: 2,
      arguments: ['f()', 'B', 'A'],
    };

    const near = spotbugsResultOf({ ...finding, symbol: 'function:p.B.f()@p.A' });
    const far = spotbugsResultOf({ ...finding, symbol: 'function:p.B.f()@java.lang.Thread' });

    expect(near.level).toBe('error');
    expect(near.locations[0].physicalLocation.artifactLocation.uri).toBe('p/B.java');
    expect(near.locations[0].logicalLocations).toStrictEqual([
      { name: 'B.f()', kind: 'function', fullyQualifiedName: 'p.B.f()' },
    ]);
    expect(far.locations[0].logicalLocations[0].name).toBe('p.B.f()');
  });

  it('leaves out the region of a finding without a line', () => {
    const result = spotbugsResultOf({
      file: '/src/p/A.java',
      rule: 'SE_BAD_FIELD',
      line: 0,
      message: '',
      symbol: 'member:p.A.t',
      priority: 1,
      arguments: ['p.A', 't'],
    });

    expect(result.level).toBe('warning');
    expect(result.locations[0].physicalLocation).toStrictEqual({
      artifactLocation: { uri: 'p/A.java' },
    });
    expect(result.locations[0].logicalLocations[0].name).toBe('A.t');
  });

  it('refuses a message it cannot read', () => {
    expect(() => resultOf('EI_EXPOSE_REP', 'something else')).toThrow(/cannot read/u);
    expect(() => resultOf('OTHER_PATTERN', 'x')).toThrow(/OTHER_PATTERN/u);
  });

  it('reads a finding row of the engine report', () => {
    expect(
      engineSpotbugsFindingOf({
        file: 'f',
        rule: 'r',
        line: 2,
        column: 1,
        message: 'm',
        symbol: 's',
        priority: 1,
      }),
    ).toStrictEqual({ file: 'f', rule: 'r', line: 2, message: 'm', symbol: 's', priority: 1 });
    expect(engineSpotbugsFindingOf({ file: 'f', rule: 'r', line: 2, message: 'm' }).symbol).toBe(
      undefined,
    );
  });
});
