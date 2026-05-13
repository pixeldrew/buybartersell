#!/usr/bin/env ts-node
import { connectDB } from '../src/db';
import { runBatchAnalysis } from '../src/analyzer';

async function main(): Promise<void> {
  await connectDB();
  await runBatchAnalysis();
  process.exit(0);
}

main().catch((err) => {
  console.error('[analyze] Fatal error:', err);
  process.exit(1);
});
