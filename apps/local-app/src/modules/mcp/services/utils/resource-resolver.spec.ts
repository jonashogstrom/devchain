import type { StorageService } from '../../../storage/interfaces/storage.interface';
import type { Document, Project, Prompt } from '../../../storage/models/domain.models';
import { ResourceResolver } from './resource-resolver';

const DOCUMENT: Document = {
  id: 'document-1',
  projectId: null,
  title: 'Readme',
  slug: 'readme',
  contentMd: '# Readme',
  archived: false,
  version: 1,
  tags: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const PROMPT: Prompt = {
  id: 'prompt-1',
  projectId: null,
  title: 'Welcome Prompt',
  content: 'Hello world',
  tags: ['intro'],
  version: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function createStorage(): jest.Mocked<StorageService> {
  return {
    getDocument: jest.fn().mockResolvedValue(DOCUMENT),
    listProjects: jest.fn().mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0 }),
    listPrompts: jest.fn().mockResolvedValue({
      items: [
        {
          ...PROMPT,
          contentPreview: PROMPT.content,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    }),
    getPrompt: jest.fn().mockResolvedValue(PROMPT),
  } as unknown as jest.Mocked<StorageService>;
}

describe('ResourceResolver', () => {
  it('returns mapped global document content', async () => {
    const storage = createStorage();
    const resolver = new ResourceResolver(storage);

    await expect(resolver.resolve('doc://global/readme')).resolves.toMatchObject({
      success: true,
      data: {
        uri: 'doc://global/readme',
        mimeType: 'text/markdown',
        content: '# Readme',
        document: { id: 'document-1' },
      },
    });
    expect(storage.getDocument).toHaveBeenCalledWith({ projectId: null, slug: 'readme' });
  });

  it('resolves a normalized project slug before loading a document', async () => {
    const storage = createStorage();
    storage.listProjects.mockResolvedValue({
      items: [{ id: 'project-1', name: 'My Project' } as Project],
      total: 1,
      limit: 1000,
      offset: 0,
    });
    const resolver = new ResourceResolver(storage);

    await resolver.resolve('doc://my-project/readme');

    expect(storage.getDocument).toHaveBeenCalledWith({ projectId: 'project-1', slug: 'readme' });
  });

  it('returns PROJECT_NOT_FOUND for an unknown project slug', async () => {
    const resolver = new ResourceResolver(createStorage());

    await expect(resolver.resolve('doc://missing/readme')).resolves.toMatchObject({
      success: false,
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('maps document lookup failures to DOCUMENT_NOT_FOUND', async () => {
    const storage = createStorage();
    storage.getDocument.mockRejectedValue(new Error('missing'));
    const resolver = new ResourceResolver(storage);

    await expect(resolver.resolve('doc://global/readme')).resolves.toMatchObject({
      success: false,
      error: { code: 'DOCUMENT_NOT_FOUND' },
    });
  });

  it('rejects malformed document resource URIs', async () => {
    const resolver = new ResourceResolver(createStorage());

    await expect(resolver.resolve('doc://readme')).rejects.toThrow('Invalid document resource URI');
  });

  it('returns a versioned prompt resource', async () => {
    const storage = createStorage();
    const resolver = new ResourceResolver(storage);

    await expect(resolver.resolve('prompt://Welcome%20Prompt@2')).resolves.toMatchObject({
      success: true,
      data: { content: 'Hello world', prompt: { id: 'prompt-1' } },
    });
    expect(storage.getPrompt).toHaveBeenCalledWith('prompt-1');
  });

  it('prefers a global prompt over a project prompt with the same title and version', async () => {
    const storage = createStorage();
    storage.listPrompts.mockResolvedValue({
      items: [
        { ...PROMPT, id: 'project-prompt', projectId: 'project-1', contentPreview: 'project' },
        { ...PROMPT, id: 'global-prompt', contentPreview: 'global' },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
    const resolver = new ResourceResolver(storage);

    await resolver.resolve('prompt://Welcome%20Prompt@2');

    expect(storage.getPrompt).toHaveBeenCalledWith('global-prompt');
  });

  it('returns PROMPT_NOT_FOUND when no title/version candidate exists', async () => {
    const storage = createStorage();
    storage.listPrompts.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const resolver = new ResourceResolver(storage);

    await expect(resolver.resolve('prompt://Missing@1')).resolves.toMatchObject({
      success: false,
      error: { code: 'PROMPT_NOT_FOUND' },
    });
  });

  it.each(['prompt://', 'prompt://Welcome@zero'])(
    'rejects malformed prompt URI %s',
    async (uri) => {
      const resolver = new ResourceResolver(createStorage());

      await expect(resolver.resolve(uri)).rejects.toThrow();
    },
  );

  it('returns UNKNOWN_RESOURCE for unsupported schemes', async () => {
    const resolver = new ResourceResolver(createStorage());

    await expect(resolver.resolve('https://example.test')).resolves.toEqual({
      success: false,
      error: { code: 'UNKNOWN_RESOURCE', message: 'Unknown resource: https://example.test' },
    });
  });
});
