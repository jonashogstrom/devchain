import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { AnthropicSkillSource } from './adapters/anthropic-skill-source.adapter';
import { GitHubDirectorySkillSourceAdapter } from './adapters/github-directory-skill-source.adapter';
import { MicrosoftSkillSource } from './adapters/microsoft-skill-source.adapter';
import { OpenAISkillSource } from './adapters/openai-skill-source.adapter';
import { SKILL_SOURCE_ADAPTERS } from './adapters/skill-source.adapter';
import { TrailOfBitsSkillSource } from './adapters/trailofbits-skill-source.adapter';
import { VercelSkillSource } from './adapters/vercel-skill-source.adapter';
import { CommunitySourcesController } from './controllers/community-sources.controller';
import { LocalSourcesController } from './controllers/local-sources.controller';
import { SkillsController } from './controllers/skills.controller';
import { CommunitySourcesService } from './services/community-sources.service';
import { LocalSourcesService } from './services/local-sources.service';
import { SkillCategoryService } from './services/skill-category.service';
import { SkillSourceRegistryService } from './services/skill-source-registry.service';
import { SkillsService } from './services/skills.service';
import { SkillSyncService } from './services/skill-sync.service';

@Module({
  imports: [StorageModule, SettingsModule],
  controllers: [SkillsController, CommunitySourcesController, LocalSourcesController],
  providers: [
    AnthropicSkillSource,
    MicrosoftSkillSource,
    OpenAISkillSource,
    TrailOfBitsSkillSource,
    VercelSkillSource,
    {
      provide: GitHubDirectorySkillSourceAdapter,
      useFactory: () =>
        new GitHubDirectorySkillSourceAdapter({
          sourceName: 'devchain',
          repoOwner: 'TwiTech-LAB',
          repoName: 'devchain',
          branch: 'main',
          skillsRoot: 'apps/local-app/skills',
          publicRepoUrl: 'https://github.com/TwiTech-LAB/devchain/tree/main/apps/local-app/skills',
        }),
    },
    SkillCategoryService,
    CommunitySourcesService,
    LocalSourcesService,
    SkillSourceRegistryService,
    SkillsService,
    SkillSyncService,
    {
      provide: SKILL_SOURCE_ADAPTERS,
      useFactory: (
        anthropicSkillSource: AnthropicSkillSource,
        microsoftSkillSource: MicrosoftSkillSource,
        openAISkillSource: OpenAISkillSource,
        trailOfBitsSkillSource: TrailOfBitsSkillSource,
        vercelSkillSource: VercelSkillSource,
        devchainSkillSource: GitHubDirectorySkillSourceAdapter,
      ) => [
        anthropicSkillSource,
        microsoftSkillSource,
        openAISkillSource,
        trailOfBitsSkillSource,
        vercelSkillSource,
        devchainSkillSource,
      ],
      inject: [
        AnthropicSkillSource,
        MicrosoftSkillSource,
        OpenAISkillSource,
        TrailOfBitsSkillSource,
        VercelSkillSource,
        GitHubDirectorySkillSourceAdapter,
      ],
    },
  ],
  exports: [
    AnthropicSkillSource,
    MicrosoftSkillSource,
    OpenAISkillSource,
    TrailOfBitsSkillSource,
    VercelSkillSource,
    SkillCategoryService,
    SkillSourceRegistryService,
    SkillsService,
    SkillSyncService,
    SKILL_SOURCE_ADAPTERS,
  ],
})
export class SkillsModule {}
