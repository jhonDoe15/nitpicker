export interface Request { body: unknown; params: Record<string, string> }
export interface Response<ResBody = unknown> { json(body: ResBody): this; send(body: ResBody): this }
export interface NextFunction { (error?: unknown): void }
export type Handler = (req: Request, res: Response, next: NextFunction) => void;
export interface Router { use(path: string, ...handlers: Handler[]): this; get(path: string, ...handlers: Handler[]): this }
export declare function Router(): Router;
export interface Express extends Router { listen(port: number, done: (req: Request) => void): void }
declare function express(): Express;
export default express;