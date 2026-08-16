import type { CreateCommunitySkillSource } from '../../storage/models/domain.models';
import { ConflictError } from '../../../common/errors/error-types';
import type { DataSeeder, SeederContext } from '../types/seeder.types';

const SEEDER_NAME = '0003_seed_preseed_jeffallan_claude_skills';
const SEEDER_VERSION = 1;

const DEFAULT_COMMUNITY_SOURCE: CreateCommunitySkillSource = {
  name: 'jeffallan',
  repoOwner: 'Jeffallan',
  repoName: 'claude-skills',
  branch: 'main',
};

type ExistingManagedSource = {
  id: string;
  name: string;
  kind: 'community' | 'local';
};

async function findExistingManagedSource(
  ctx: SeederContext,
): Promise<ExistingManagedSource | null> {
  const [community, local] = await Promise.all([
    ctx.storage.getCommunitySkillSourceByName(DEFAULT_COMMUNITY_SOURCE.name),
    ctx.storage.getLocalSkillSourceByName(DEFAULT_COMMUNITY_SOURCE.name),
  ]);

  if (community) {
    return { id: community.id, name: community.name, kind: 'community' };
  }
  if (local) {
    return { id: local.id, name: local.name, kind: 'local' };
  }
  return null;
}

function logSkipped(ctx: SeederContext, existing: ExistingManagedSource): void {
  ctx.logger.info(
    {
      seederName: SEEDER_NAME,
      seederVersion: SEEDER_VERSION,
      created: 0,
      skipped: 1,
      existingSourceId: existing.id,
      sourceName: existing.name,
      collidingKind: existing.kind,
    },
    'Pre-seed jeffallan community source seeder completed',
  );
}

export async function runSeedPreseedJeffallanClaudeSkills(ctx: SeederContext): Promise<void> {
  const existing = await findExistingManagedSource(ctx);
  if (existing) {
    logSkipped(ctx, existing);
    return;
  }

  try {
    const created = await ctx.storage.createCommunitySkillSource(DEFAULT_COMMUNITY_SOURCE);
    ctx.logger.info(
      {
        seederName: SEEDER_NAME,
        seederVersion: SEEDER_VERSION,
        created: 1,
        skipped: 0,
        sourceId: created.id,
        sourceName: created.name,
      },
      'Pre-seed jeffallan community source seeder completed',
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      const racedSource = await findExistingManagedSource(ctx);
      if (racedSource) {
        logSkipped(ctx, racedSource);
        return;
      }
    }
    throw error;
  }
}

export const seedPreseedJeffallanClaudeSkillsSeeder: DataSeeder = {
  name: SEEDER_NAME,
  version: SEEDER_VERSION,
  run: runSeedPreseedJeffallanClaudeSkills,
};
