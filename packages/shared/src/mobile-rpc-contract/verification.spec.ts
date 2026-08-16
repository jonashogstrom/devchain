import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findForbiddenMobileSharedImports,
  verifyCrossAppContract,
} from '../../scripts/generate-mobile-rpc-contract.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

describe('cross-app mobile RPC verification', () => {
  it('keeps bridge admission, local handlers, and mobile callers on the canonical 41 methods', async () => {
    await expect(verifyCrossAppContract({ repositoryRoot })).resolves.toEqual([]);
  });

  it('rejects a removed executable caller when type references retain the method literal', async () => {
    const relativePath = 'apps/mobile-app/src/services/bridge-client.ts';
    const source = await readFile(resolve(repositoryRoot, relativePath), 'utf8');
    const caller =
      "  return relayRequest(token, instanceId, 'board.listWorkspaces', {}, authRetry);";
    expect(source).toContain(caller);

    const withoutCaller = source.replace(caller, '  return Promise.resolve([]);');
    expect(withoutCaller).toContain("MobileRpcResult<'board.listWorkspaces'>");

    const issues = await verifyCrossAppContract({
      repositoryRoot,
      mobileSourceOverrides: { [relativePath]: withoutCaller },
    });
    expect(issues).toContainEqual(
      expect.stringContaining('Mobile RPC callers differs from the canonical catalog'),
    );
    expect(issues).toContainEqual(expect.stringContaining('missing: board.listWorkspaces'));
  });

  it('rejects a removed custom revoke call when its method constant remains', async () => {
    const relativePath = 'apps/mobile-app/src/services/bridge-client.ts';
    const source = await readFile(resolve(repositoryRoot, relativePath), 'utf8');
    const caller = '        method: RPC_E2EE_REVOKE_METHOD,';
    expect(source).toContain(caller);

    const withoutCaller = source.replace(caller, '');
    expect(withoutCaller).toContain('RPC_E2EE_REVOKE_METHOD');

    const issues = await verifyCrossAppContract({
      repositoryRoot,
      mobileSourceOverrides: { [relativePath]: withoutCaller },
    });
    expect(issues).toContainEqual(expect.stringContaining('missing: e2ee.revokeDeviceKey'));
  });

  it('rejects shared-package imports from mobile production source', async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'devchain-mobile-rpc-verification-'));
    try {
      const sourceDirectory = resolve(temporaryRoot, 'apps/mobile-app/src');
      const testDirectory = resolve(temporaryRoot, 'apps/mobile-app/__tests__');
      await Promise.all([
        mkdir(sourceDirectory, { recursive: true }),
        mkdir(testDirectory, { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          resolve(sourceDirectory, 'forbidden.ts'),
          "import { example } from '@devchain/shared';\n",
          'utf8',
        ),
        writeFile(
          resolve(testDirectory, 'allowed.spec.ts'),
          "import { example } from '@devchain/shared';\n",
          'utf8',
        ),
      ]);

      await expect(
        findForbiddenMobileSharedImports({ repositoryRoot: temporaryRoot }),
      ).resolves.toEqual(['apps/mobile-app/src/forbidden.ts']);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('runs the non-mutating generated check before builds and compiles mobile in CI', async () => {
    const [rootPackage, workflow] = await Promise.all([
      readFile(resolve(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
      readFile(resolve(repositoryRoot, '.github/workflows/test.yml'), 'utf8'),
    ]);

    expect(rootPackage.scripts['check:mobile-rpc-contract']).toContain('--check');
    expect(rootPackage.scripts['check:mobile-rpc-contract']).not.toContain('--write');
    expect(rootPackage.scripts.build.startsWith('pnpm check:mobile-rpc-contract &&')).toBe(true);

    const checkIndex = workflow.indexOf('name: Check generated mobile RPC contract');
    const buildIndex = workflow.indexOf('name: Build');
    const mobileTypecheckIndex = workflow.indexOf('name: Typecheck generated mobile RPC consumer');
    expect(checkIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(checkIndex);
    expect(mobileTypecheckIndex).toBeGreaterThan(buildIndex);
    expect(workflow.slice(checkIndex, buildIndex)).not.toContain('generate:mobile-rpc-contract');
  });
});
