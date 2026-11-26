import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as S from 'next/server';
import { UserEntity } from '../users/user.entity';
const db = new PrismaClient();
export async function GET() { return NextResponse.json(await db.post.findMany()); }
export async function POST() { return S.NextResponse.json(new UserEntity()); }
export async function PUT() { return Response.json(new UserEntity()); }
export async function DELETE() { return new Response(JSON.stringify(new UserEntity())); }
class Response2 { static json(a: unknown) { return a; } }
export async function HEAD() { return Response2.json(new UserEntity()); }
