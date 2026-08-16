import { ProjectsTable } from './ProjectsTable';
import { ProjectsDialogs } from './ProjectsDialogs';
import type { ProjectsPagePresentation } from './projects-page-presentation';

interface ProjectsPageViewProps {
  presentation: ProjectsPagePresentation;
}

export function ProjectsPageView({ presentation }: ProjectsPageViewProps) {
  return (
    <div>
      <ProjectsTable model={presentation.table} />
      <ProjectsDialogs model={presentation.dialogs} />
    </div>
  );
}
