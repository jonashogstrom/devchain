import type { DocumentToolContext } from './document-context';
import {
  handleCreateDocument,
  handleGetDocument,
  handleListDocuments,
  handleUpdateDocument,
} from './document-tools';

const SESSION_ID = '00000000-0000-0000-0000-000000000001';
const PROJECT_ID = 'project-1';
const DOCUMENT = {
  id: 'document-1',
  projectId: PROJECT_ID,
  title: 'Readme',
  slug: 'readme',
  contentMd: '# Readme',
  archived: false,
  version: 2,
  tags: ['guide'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function createContext(): DocumentToolContext {
  return {
    storage: {
      listDocuments: jest
        .fn()
        .mockResolvedValue({ items: [DOCUMENT], total: 1, limit: 10, offset: 2 }),
      getDocument: jest.fn().mockResolvedValue(DOCUMENT),
      createDocument: jest.fn().mockResolvedValue(DOCUMENT),
      updateDocument: jest.fn().mockResolvedValue(DOCUMENT),
    },
    defaultInlineMaxBytes: 64 * 1024,
    resolveSessionContext: jest.fn().mockResolvedValue({
      success: true,
      data: {
        type: 'agent',
        session: { id: SESSION_ID, agentId: 'agent-1', status: 'running', startedAt: '' },
        agent: { id: 'agent-1', name: 'Coder', projectId: PROJECT_ID },
        project: { id: PROJECT_ID, name: 'Project', rootPath: '/project' },
      },
    }),
  };
}

describe('document-tools handlers', () => {
  it('lists documents with project-scoped filters', async () => {
    const ctx = createContext();

    const result = await handleListDocuments(ctx, {
      sessionId: SESSION_ID,
      tags: ['guide'],
      q: 'read',
      limit: 10,
      offset: 2,
    });

    expect(ctx.storage.listDocuments).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      tags: ['guide'],
      q: 'read',
      limit: 10,
      offset: 2,
    });
    expect(result).toMatchObject({ success: true, data: { total: 1, limit: 10, offset: 2 } });
  });

  it('returns the session error before document listing', async () => {
    const ctx = createContext();
    (ctx.resolveSessionContext as jest.Mock).mockResolvedValue({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'missing' },
    });

    await expect(handleListDocuments(ctx, { sessionId: SESSION_ID })).resolves.toMatchObject({
      success: false,
      error: { code: 'SESSION_NOT_FOUND' },
    });
    expect(ctx.storage.listDocuments).not.toHaveBeenCalled();
  });

  it('gets a document by id without link traversal when includeLinks is none', async () => {
    const ctx = createContext();

    const result = await handleGetDocument(ctx, { id: DOCUMENT.id, includeLinks: 'none' });

    expect(ctx.storage.getDocument).toHaveBeenCalledWith({ id: DOCUMENT.id });
    expect(result).toMatchObject({
      success: true,
      data: { document: { id: DOCUMENT.id }, links: [] },
    });
  });

  it('gets a global document by slug', async () => {
    const ctx = createContext();

    await handleGetDocument(ctx, { slug: 'readme', projectId: '', includeLinks: 'none' });

    expect(ctx.storage.getDocument).toHaveBeenCalledWith({ slug: 'readme', projectId: null });
  });

  it('creates a document in the session project', async () => {
    const ctx = createContext();

    await expect(
      handleCreateDocument(ctx, {
        sessionId: SESSION_ID,
        title: 'Readme',
        contentMd: '# Readme',
        tags: ['guide'],
      }),
    ).resolves.toEqual({ success: true, data: { id: DOCUMENT.id, version: 2 } });
    expect(ctx.storage.createDocument).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      title: 'Readme',
      contentMd: '# Readme',
      tags: ['guide'],
    });
  });

  it('updates a document with optimistic version input', async () => {
    const ctx = createContext();

    await expect(
      handleUpdateDocument(ctx, { id: DOCUMENT.id, title: 'Updated', version: 1 }),
    ).resolves.toEqual({ success: true, data: { id: DOCUMENT.id, version: 2 } });
    expect(ctx.storage.updateDocument).toHaveBeenCalledWith(DOCUMENT.id, {
      title: 'Updated',
      slug: undefined,
      contentMd: undefined,
      tags: undefined,
      archived: undefined,
      version: 1,
    });
  });
});
