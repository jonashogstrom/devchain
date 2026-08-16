import { createFileImportRequest, createTemplateImportRequest } from './project-import-request';

describe('project import request construction', () => {
  it('emits only slug for bundled templates', () => {
    expect(createTemplateImportRequest('starter', 'bundled', '9.9.9')).toEqual({
      slug: 'starter',
    });
  });

  it('emits slug and selected version for registry templates', () => {
    expect(createTemplateImportRequest('downloaded', 'registry', '2.1.0')).toEqual({
      slug: 'downloaded',
      version: '2.1.0',
    });
  });

  it('parses file content into rawContent', async () => {
    const rawContent = { manifest: { slug: 'file' }, agents: [] };
    await expect(
      createFileImportRequest({ text: async () => JSON.stringify(rawContent) }),
    ).resolves.toEqual({ rawContent });
  });

  it('rejects invalid JSON file content', async () => {
    await expect(createFileImportRequest({ text: async () => '{invalid' })).rejects.toThrow();
  });
});
