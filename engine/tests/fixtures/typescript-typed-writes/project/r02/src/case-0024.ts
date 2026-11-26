import pRetry from 'p-retry';

import Stripe from 'stripe';
import { Queue } from 'bullmq';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { sendOrder, readOrder, Sender } from './store';
const stripe = new Stripe('key');
const queue = new Queue('orders');
const sqs = new SQSClient();
export async function run(id: string) { await pRetry(async () => { await queue.add('order', { id }, { jobId: id }); }); }