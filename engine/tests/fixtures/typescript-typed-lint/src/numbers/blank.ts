declare const env: { TRIAL_DAYS: string | undefined };
declare const params: URLSearchParams;

export function trialDays() {
  const value = Number(process.env.TRIAL_DAYS);
  if (Number.isNaN(value)) {
    throw new Error("TRIAL_DAYS must be a number");
  }
  return value;
}

export function parse(text: string, maybe: string | undefined, fixed: "1" | "", count: number) {
  const first = Number(text);
  if (isNaN(first)) {
    return 0;
  }
  const second = +maybe;
  const third = Number(fixed);
  return [Number.isFinite(Number(maybe)), second > 0 ? 1 : Number.isNaN(second), Number.isFinite(third), Number.isNaN(Number(count))];
}

export function guarded(text: string, other: string, query: URLSearchParams) {
  if (text.trim() === "") {
    return 0;
  }
  const a = Number(text);
  const b = Number(other || "5");
  const c = Number(query.get("page"));
  const [whole = ""] = other.split(".");
  const d = Number(whole);
  const e = +other;
  return [Number.isNaN(a), Number.isNaN(b), Number.isNaN(c), isNaN(d), e > 0 && Number.isNaN(e), params.get("x")];
}
