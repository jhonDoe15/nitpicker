import { UserEntity, AdminEntity, Audit, UserView } from '../users/user.entity';
import { Invoice, type CatDocument, type ProfileDocument } from '../users/models';
import { NextResponse } from 'next/server';
export async function GET(): Promise<NextResponse<Invoice[]>> { return NextResponse.json([new Invoice()]); }