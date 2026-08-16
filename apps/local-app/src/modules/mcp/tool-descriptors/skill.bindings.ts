import type { SkillsService } from '../../skills/services/skills.service';
import type { SkillToolContext } from '../services/handlers/skill-context';
import { handleListSkills, handleGetSkill } from '../services/handlers/skill-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createSkillContext(runtime: McpBindingRuntime): SkillToolContext {
  return {
    skillsService: runtime.skillsService ?? createNullAdapter<SkillsService>('SkillsService'),
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const skillBindings = defineToolGroup<SkillToolContext>(createSkillContext, [
  ['devchain_list_skills', handleListSkills],
  ['devchain_get_skill', handleGetSkill],
]);
