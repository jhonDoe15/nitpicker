import { Order } from './store';
export async function toDto(order: Order) { return { order, customer: await order.customer }; }
export async function second(_x: number, order: Order) { return await order.lines; }
export const arrow = async (order: Order) => await order.customer;
export const exprBody = async (order: Order) => (await order.quoted);
export async function nested(order: Order) { const f = async () => await order.customer; return f(); }
export async function other(order: Order, more: Order) { return await more.customer; }
export async function chain(order: Order) { return await order.customer.then((c) => c); }
export async function buyerOnly(order: Order) { return await order.buyer; }
export async function destr({ customer }: Order) { return await customer; }
export function notAsync(order: Order) { return order.customer; }
export const obj = { async toDto(order: Order) { return await order.customer; } };
export class Svc { async map(order: Order) { return await order.lines; } static async smap(order: Order) { return await order.customer; } }
export { toDto as renamedDto };
export default async function (order: Order) { return await order.customer; }
