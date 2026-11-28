export declare class NextRequest { url: string }
export declare class NextResponse<Body = unknown> {
  body: Body;
  static json<JsonBody>(body: JsonBody): NextResponse<JsonBody>;
}