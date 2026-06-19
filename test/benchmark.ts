/* eslint-disable @typescript-eslint/no-explicit-any */
import { performance } from 'perf_hooks';
import { resolveDoorKey } from '../src/email-parser';

const envString = {
  GARAGE_STATE: {} as any,
  GARAGE_DOORS: JSON.stringify({
    'Garage Door Left': 'garage-left',
    'Garage Door Right': 'garage-right',
    'Main Garage': 'main-garage',
  }),
};

const envObject = {
  GARAGE_STATE: {} as any,
  GARAGE_DOORS: {
    'Garage Door Left': 'garage-left',
    'Garage Door Right': 'garage-right',
    'Main Garage': 'main-garage',
  },
};

const iterations = 1_000_000;

function runBenchmark(env: any, type: string) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    // Repeatedly look up known keys
    resolveDoorKey('Main Garage', env);
    resolveDoorKey('Garage Door Left', env);
    resolveDoorKey('Garage Door Right', env);
    // Look up an unknown key
    resolveDoorKey('Unknown Door', env);
  }
  const end = performance.now();
  const timeMs = end - start;
  console.log(
    `[${type}] ${iterations.toLocaleString()} iterations took ${timeMs.toFixed(2)}ms (${(timeMs / iterations).toFixed(6)}ms/iter)`,
  );
}

console.log('--- Benchmark ---');
runBenchmark(envString, 'JSON string');
runBenchmark(envObject, 'Object map');
