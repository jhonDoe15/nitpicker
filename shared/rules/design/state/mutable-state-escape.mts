import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { displayName } from '../design-index.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCall,
  DesignCallable,
  DesignField,
  DesignFinding,
  DesignIndex,
  DesignType,
} from '../typed/design-types.mts';

type Escaped = { readonly owner: DesignType; readonly field: DesignField };
type EscapeSite = {
  readonly caller: DesignCallable;
  readonly call: DesignCall;
  readonly member: DesignCallable;
  readonly escaped: Escaped;
};

const RULE = DESIGN_RULE_IDS.mutableStateEscape;

function escapedField(member: DesignCallable | undefined, index: DesignIndex): Escaped | undefined {
  if (member === undefined || !member.exported || member.returnsField === undefined) {
    return undefined;
  }
  const owner = member.owner === undefined ? undefined : index.type(member.owner);
  const field = (owner?.fields ?? []).find(
    ({ name, mutable, private: hidden }) =>
      name === member.returnsField && mutable === true && hidden === true,
  );
  return field === undefined || owner === undefined ? undefined : { owner, field };
}

function escapeMessage({ caller, call, member, escaped }: EscapeSite, index: DesignIndex): string {
  const surface = displayName(member, index);
  const owner = escaped.owner.name;
  const operation = call.mutation === 'assign' ? 'an assignment' : `\`${String(call.mutation)}\``;
  const change = `${displayName(caller, index)} changes the private \`${escaped.field.name}\` of ${owner}`;
  const through = `through the value \`${surface}\` returns (${operation})`;
  const fix = `Return a copy or a read-only view from \`${surface}\`, or add an operation to ${owner}`;
  return `${change} ${through}, so ${owner} no longer controls its own state. ${fix} that makes this change.`;
}

function escapeFinding(
  site: EscapeSite,
  { index, finding }: { readonly index: DesignIndex; readonly finding: DesignFinding },
): Finding[] {
  const { caller, call, member } = site;
  return finding({
    rule: RULE,
    path: caller.file,
    identity: `${caller.id}>${member.id}:${String(call.mutation)}`,
    symbol: displayName(caller, index),
    line: call.line,
    message: escapeMessage(site, index),
  });
}

function callerEscapes(caller: DesignCallable, index: DesignIndex): EscapeSite[] {
  return (caller.calls ?? [])
    .filter(({ mutation }) => mutation !== undefined)
    .flatMap((call) => {
      const member = index.callable(call.target);
      const escaped = escapedField(member, index);
      return member !== undefined &&
        escaped !== undefined &&
        escaped.owner.file !== caller.file &&
        escaped.owner.id !== caller.owner
        ? [{ caller, call, member, escaped }]
        : [];
    });
}

export function mutableStateEscapeFindings(index: DesignIndex, finding: DesignFinding): Finding[] {
  return index.callables
    .flatMap((caller) => callerEscapes(caller, index))
    .flatMap((site) => escapeFinding(site, { index, finding }));
}
