import { PrismaClient, type Post, type Prisma } from '@prisma/client';
const db = new PrismaClient();
import { Body, Controller, Get, Post as PostRoute, Put } from '@nestjs/common';
@Controller('posts')
export class PostsController {
  @Get() list(): Promise<Post[]> { return db.post.findMany(); }
  @Get('one') one(): Promise<Post | null> { return db.post.findFirst(); }
  @Get('inferred') inferred() { return db.post.findMany(); }
  @Get('payload') payload(): Promise<Prisma.PostGetPayload<{}>[]> { return db.post.findMany(); }
}
