import { PrismaClient, type Post, type Prisma } from '@prisma/client';
const db = new PrismaClient();
import { NextResponse } from 'next/server';
export async function GET(): Promise<NextResponse<Post[]>> { return NextResponse.json(await db.post.findMany()); }
export const POST = async (): Promise<Response> => Response.json(await db.post.findFirst());