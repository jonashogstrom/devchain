import type { CommunitySkillSource } from '../../storage/models/domain.models';
import { GitHubDirectorySkillSourceAdapter } from './github-directory-skill-source.adapter';

export class CommunitySkillSourceAdapter extends GitHubDirectorySkillSourceAdapter {
  constructor(source: CommunitySkillSource) {
    super({
      sourceName: source.name,
      repoOwner: source.repoOwner,
      repoName: source.repoName,
      branch: source.branch,
      skillsRoot: 'skills',
    });
  }
}
