import { BoardPageView } from '@/ui/pages/board/BoardPageView';
import { useBoardPageController } from '@/ui/hooks/useBoardPageController';

export function BoardPage() {
  const presentation = useBoardPageController();
  return <BoardPageView presentation={presentation} />;
}
