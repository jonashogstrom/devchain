import type { ProjectCommunicationService } from '../../project-communication/project-communication.service';
import type { ProjectToolContext } from '../services/handlers/project-context';
import { handleProjectsList } from '../services/handlers/project-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createProjectContext(runtime: McpBindingRuntime): ProjectToolContext {
  return {
    projectCommunicationService:
      runtime.projectCommunicationService ??
      createNullAdapter<ProjectCommunicationService>('ProjectCommunicationService'),
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const projectBindings = defineToolGroup<ProjectToolContext>(createProjectContext, [
  ['devchain_projects_list', handleProjectsList],
]);
