import { stack } from './stack';

/**
 * After the last test, while the stack is still running: the run fails if any server of the stack
 * tried to connect to something it may not (see e2e/stack/no-egress.cjs). A blocked attempt means
 * some data or configuration of the stack still points outside, and a test may be passing only
 * because the guard stopped it: it must be fixed, not ignored.
 */
export default async function globalTeardown(): Promise<void> {
  const report = await stack.egress();
  const servers = ['backend', 'frontend'] as const;
  const problems = servers.flatMap((server) => {
    const state = report[server];
    if (!state?.active) return [`${server}: network guard not active`];
    return state.blocked.map((line) => `${server}: ${line}`);
  });
  if (problems.length) {
    throw new Error(
      `The e2e stack tried to reach the network during the run:\n  ${problems.join('\n  ')}\n` +
        'Logs: e2e/.artifacts/stack/*.log',
    );
  }
  console.log('[e2e] network guard: no outbound connection attempted by the stack during the run');
}
