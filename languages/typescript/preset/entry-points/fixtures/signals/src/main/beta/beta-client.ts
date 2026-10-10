export class BetaClient {
  public constructor(
    public readonly publicValue: string,
    public readonly internalValue: string,
    public readonly missingValue: string,
  ) {}
}
