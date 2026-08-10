import { validate } from 'class-validator';
import { UpgradeTemplateDto } from './template-upgrade.dto';

describe('UpgradeTemplateDto', () => {
  it('accepts the configuration fields emitted by the upgrade wizard', async () => {
    const dto = Object.assign(new UpgradeTemplateDto(), {
      targetVersion: '2.0.0',
      selectedProviderNames: ['claude'],
      familyProviderMappings: { anthropic: 'claude' },
      agentOverrides: [{ agentName: 'Coder', providerConfigName: 'Claude Default' }],
      teamOverrides: [{ teamName: 'Builders', maxMembers: 4 }],
      statusMappings: { Review: 'status-review' },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects an empty provider selection when the field is present', async () => {
    const dto = Object.assign(new UpgradeTemplateDto(), {
      targetVersion: '2.0.0',
      selectedProviderNames: [],
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'selectedProviderNames' })]),
    );
  });
});
