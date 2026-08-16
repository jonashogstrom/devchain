import { NotFoundError, ValidationError } from '../../../../common/errors/error-types';
import { ServiceUnavailableError } from '../../../../common/errors/service-unavailable.error';
import type { Skill } from '../../../storage/models/domain.models';
import type { SkillToolContext } from './skill-context';
import { handleGetSkill, handleListSkills } from './skill-tools';

const SESSION_ID = '00000000-0000-0000-0000-000000000001';
const SKILL: Skill = {
  id: 'skill-1',
  slug: 'source/testing',
  name: 'testing',
  displayName: 'Testing',
  description: 'Test skill',
  shortDescription: 'Tests',
  source: 'source',
  sourceUrl: null,
  sourceCommit: null,
  category: null,
  license: null,
  compatibility: null,
  frontmatter: null,
  instructionContent: 'Instructions',
  contentPath: null,
  resources: [],
  status: 'available',
  lastSyncedAt: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function createContext(): SkillToolContext {
  return {
    skillsService: {
      listDiscoverable: jest.fn().mockResolvedValue([SKILL]),
      getSkillBySlug: jest.fn().mockResolvedValue(SKILL),
      logUsage: jest.fn().mockResolvedValue(undefined),
    } as SkillToolContext['skillsService'],
    resolveSessionContext: jest.fn().mockResolvedValue({
      success: true,
      data: {
        type: 'agent',
        session: { id: SESSION_ID, agentId: 'agent-1', status: 'running', startedAt: '' },
        agent: { id: 'agent-1', name: 'Coder', projectId: 'project-1' },
        project: { id: 'project-1', name: 'Project', rootPath: '/project' },
      },
    }),
  };
}

describe('skill-tools handlers', () => {
  it('lists discoverable project skills with the query', async () => {
    const ctx = createContext();

    await expect(
      handleListSkills(ctx, { sessionId: SESSION_ID, q: 'test' }),
    ).resolves.toMatchObject({
      success: true,
      data: { total: 1, skills: [{ slug: 'source/testing' }] },
    });
    expect(ctx.skillsService.listDiscoverable).toHaveBeenCalledWith('project-1', { q: 'test' });
  });

  it('returns PROJECT_NOT_FOUND when the session has no project', async () => {
    const ctx = createContext();
    (ctx.resolveSessionContext as jest.Mock).mockResolvedValue({
      success: true,
      data: { type: 'agent', agent: null, project: null },
    });

    await expect(handleListSkills(ctx, { sessionId: SESSION_ID })).resolves.toMatchObject({
      success: false,
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('normalizes a slug and records usage with agent actor context', async () => {
    const ctx = createContext();

    await expect(
      handleGetSkill(ctx, { sessionId: SESSION_ID, slug: ' SOURCE/TESTING ' }),
    ).resolves.toMatchObject({ success: true, data: { slug: 'source/testing' } });
    expect(ctx.skillsService.getSkillBySlug).toHaveBeenCalledWith('source/testing');
    expect(ctx.skillsService.logUsage).toHaveBeenCalledWith(
      'skill-1',
      'source/testing',
      'project-1',
      'agent-1',
      'Coder',
    );
  });

  it('maps a missing skill to SKILL_NOT_FOUND', async () => {
    const ctx = createContext();
    (ctx.skillsService.getSkillBySlug as jest.Mock).mockRejectedValue(
      new NotFoundError('Skill', 'missing'),
    );

    await expect(
      handleGetSkill(ctx, { sessionId: SESSION_ID, slug: 'missing' }),
    ).resolves.toMatchObject({ success: false, error: { code: 'SKILL_NOT_FOUND' } });
  });

  it('preserves skill validation details', async () => {
    const ctx = createContext();
    (ctx.skillsService.getSkillBySlug as jest.Mock).mockRejectedValue(
      new ValidationError('bad slug', { slug: 'bad' }),
    );

    await expect(handleGetSkill(ctx, { sessionId: SESSION_ID, slug: 'bad' })).resolves.toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'bad slug', data: { slug: 'bad' } },
    });
  });

  it('maps unavailable skill operations', async () => {
    const ctx = createContext();
    (ctx.skillsService.listDiscoverable as jest.Mock).mockRejectedValue(
      new ServiceUnavailableError('SkillsService'),
    );

    await expect(handleListSkills(ctx, { sessionId: SESSION_ID })).resolves.toMatchObject({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
});
