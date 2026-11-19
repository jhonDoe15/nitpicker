export type MemberFrame = {
  memberStart: number;
  parentheses: number;
  equals: number;
  braces: number;
};
type TokenStep<State, Frame extends MemberFrame> = {
  readonly state: State;
  readonly frame: Frame | undefined;
  readonly handler: ((state: State, frame: Frame, offset: number) => void) | undefined;
  readonly token: string;
  readonly offset: number;
};
type FrameOperations = {
  readonly resetMember: (frame: MemberFrame, memberStart: number) => void;
  readonly braceHeader: (text: string, frame: MemberFrame, offset: number) => string | undefined;
  readonly leaveBrace: (frames: MemberFrame[], frame: MemberFrame, offset: number) => void;
  readonly countMemberToken: (frame: MemberFrame, token: string, offset: number) => void;
  readonly dispatchToken: <State, Frame extends MemberFrame>(step: TokenStep<State, Frame>) => void;
};

export function frameOperations(): FrameOperations {
  function resetMember(frame: MemberFrame, memberStart: number): void {
    Object.assign(frame, { memberStart, parentheses: 0, equals: -1, braces: 0 });
  }

  function braceHeader(text: string, frame: MemberFrame, offset: number): string | undefined {
    if (frame.parentheses !== 0 || frame.equals >= 0 || frame.braces !== 0) {
      frame.braces += 1;
      return undefined;
    }
    return text.slice(frame.memberStart, offset);
  }

  function leaveBrace(frames: MemberFrame[], frame: MemberFrame, offset: number): void {
    if (frame.braces > 0) {
      frame.braces -= 1;
      return;
    }
    frames.pop();
    const parent = frames.at(-1);
    if (parent !== undefined) {
      resetMember(parent, offset + 1);
    }
  }

  function countMemberToken(frame: MemberFrame, token: string, offset: number): void {
    if (token === '(') {
      frame.parentheses += 1;
    } else if (token === ')') {
      frame.parentheses -= 1;
    } else if (token === '=' && frame.parentheses === 0 && frame.equals < 0) {
      frame.equals = offset;
    }
  }

  function dispatchToken<State, Frame extends MemberFrame>(step: TokenStep<State, Frame>): void {
    const { state, frame, handler, token, offset } = step;
    if (frame === undefined) {
      return;
    }
    if (handler === undefined) {
      countMemberToken(frame, token, offset);
    } else {
      handler(state, frame, offset);
    }
  }

  return { resetMember, braceHeader, leaveBrace, countMemberToken, dispatchToken };
}
