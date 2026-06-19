import { TaskDetailScreen } from "@/components/task-detail-screen";

export default async function ProjectTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  return <TaskDetailScreen projectId={id} taskId={taskId} />;
}
