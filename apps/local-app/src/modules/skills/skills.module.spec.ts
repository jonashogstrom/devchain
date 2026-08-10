import { MODULE_METADATA } from '@nestjs/common/constants';
import type { SkillSourceAdapter } from './adapters/skill-source.adapter';
import { GitHubDirectorySkillSourceAdapter } from './adapters/github-directory-skill-source.adapter';
import { SkillsModule } from './skills.module';
import { SKILL_SOURCE_ADAPTERS } from './adapters/skill-source.adapter';

type FactoryProvider = {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
  inject?: unknown[];
};

function providers(): FactoryProvider[] {
  return ((Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SkillsModule) as unknown[]) ?? []).filter(
    (provider): provider is FactoryProvider =>
      typeof provider === 'object' && provider !== null && 'provide' in provider,
  );
}

function makeAdapter(sourceName: string): SkillSourceAdapter {
  return {
    sourceName,
    repoUrl: `https://example.test/${sourceName}`,
    createSyncContext: jest.fn(),
    listSkills: jest.fn(),
    downloadSkill: jest.fn(),
    getLatestCommit: jest.fn(),
  };
}

describe('SkillsModule', () => {
  it('registers exactly one configured native devchain adapter in the built-in list', () => {
    const moduleProviders = providers();
    const configuredProvider = moduleProviders.find(
      (provider) => provider.provide === GitHubDirectorySkillSourceAdapter,
    );
    const adapterListProvider = moduleProviders.find(
      (provider) => provider.provide === SKILL_SOURCE_ADAPTERS,
    );

    expect(configuredProvider).toBeDefined();
    expect(adapterListProvider).toBeDefined();

    const devchainAdapter = configuredProvider?.useFactory() as GitHubDirectorySkillSourceAdapter;
    expect(devchainAdapter).toBeInstanceOf(GitHubDirectorySkillSourceAdapter);
    expect(devchainAdapter.sourceName).toBe('devchain');
    expect(devchainAdapter.repoUrl).toBe(
      'https://github.com/TwiTech-LAB/devchain/tree/main/apps/local-app/skills',
    );
    expect(devchainAdapter.skillsRoot).toBe('apps/local-app/skills');

    const createBuiltIns = adapterListProvider?.useFactory as (
      ...adapters: SkillSourceAdapter[]
    ) => SkillSourceAdapter[];
    const builtIns = createBuiltIns(
      makeAdapter('anthropic'),
      makeAdapter('microsoft'),
      makeAdapter('openai'),
      makeAdapter('trailofbits'),
      makeAdapter('vercel'),
      devchainAdapter,
    );

    expect(builtIns.filter((adapter) => adapter.sourceName === 'devchain')).toHaveLength(1);
    expect(adapterListProvider?.inject).toEqual([
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      GitHubDirectorySkillSourceAdapter,
    ]);
  });
});
