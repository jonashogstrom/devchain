import { useProjectsPageController } from '@/ui/hooks/useProjectsPageController';
import { ProjectsPageView } from '@/ui/pages/projects/ProjectsPageView';

export function ProjectsPage() {
  const presentation = useProjectsPageController();
  return <ProjectsPageView presentation={presentation} />;
}
