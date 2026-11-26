type Response = Promise<{ data: any }>;
type Config = { headers?: Record<string, string> };
declare const axios: {
  get(url: string, config?: Config): Response;
  post(url: string, body?: unknown, config?: Config): Response;
};
export default axios;
