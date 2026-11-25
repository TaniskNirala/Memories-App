import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend unit/regression tests (backend tests live in tests/run_tests.ts).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.{ts,tsx}'],
    globals: false,
  },
});

