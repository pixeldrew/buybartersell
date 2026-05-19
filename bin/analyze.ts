#!/usr/bin/env ts-node
import '../src/env.ts';
import { connectDB } from '../src/db.ts';
import { runBatchAnalysis } from '../src/analyzer.ts';

async function main(): Promise<void> {
  await connectDB();
  await runBatchAnalysis();
  process.exit(0);
}

main().catch((err) => {
  console.error('[analyze] Fatal error:', err);
  process.exit(1);
});
