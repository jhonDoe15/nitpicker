declare const got: { get(url: string): Promise<any>; post(url: string): Promise<any>; extend(o: object): typeof got };
export default got;
