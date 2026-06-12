import React, { useState } from 'react';
import { useAppState } from "@/components/app-state";
import {
  canManageWorkspace,
  canEditProject,
  canDeleteProject,
  canCreateTask,
} from "@/lib/permissions";
import EditProjectModal from './EditProjectModal';
import TaskDetailModal from './TaskDetailModal';



// Mock data types for demonstration
interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  dueDate: string;
  client: string;
  assignedStaff: string[];
  status: 'Active' | 'Waiting Feedback' | 'Revision Needed' | 'Approved' | 'Completed';
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  assignee: string;
  dueDate?: string;
}

interface ProjectDetailScreenProps {
  project: Project;
  tasks: Task[];
  onEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onAddTask: (projectId: string) => void;
  onUpdateTask: (updatedTask: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const ProjectDetailScreen: React.FC<ProjectDetailScreenProps> = ({
  project,
  tasks,
  onEditProject,
  onDeleteProject,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const { user } = useAppState();

  const isManager = user ? canManageWorkspace(user.role) : false;

  const canEditDetails = user ? canEditProject(user.role) : false;
  const canRemoveProject = user ? canDeleteProject(user.role) : false;
  const canManageTasks = user ? canCreateTask(user.role) : false;


  const [showEditModal, setShowEditModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleEditClick = () => {
    setShowEditModal(true);
  };

  const handleDeleteClick = () => {
    if (window.confirm(`Are you sure you want to delete project "${project.name}"?`)) {
      onDeleteProject(project.id);
    }
  };

  const handleAddTaskClick = () => {
    onAddTask(project.id); // This would typically open a modal or navigate to a new task form
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setShowTaskDetailModal(true);
  };

  const getStatusClass = (status: Project['status'] | Task['status']) => {
    switch (status) {
      case 'Active':
      case 'In Progress':
        return 'status-active';
      case 'Waiting Feedback':
      case 'Pending':
        return 'status-waiting';
      case 'Revision Needed':
        return 'status-revision';
      case 'Approved':
        return 'status-approved';
      case 'Completed':
        return 'status-completed';
      default:
        return '';
    }
  };

  return (
    <div className="mobile-container">
      <div className="page-header">
        <h1 className="page-title">{project.name}</h1>
        {isManager && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn-ghost" onClick={handleEditClick}>
              Edit Project
            </button>
            <button className="btn-danger" onClick={handleDeleteClick}>
              Delete Project
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <p className="label">Description</p>
        <p className="body-text" style={{ marginBottom: '12px' }}>{project.description}</p>

        <p className="label">Category</p>
        <p className="secondary-text" style={{ marginBottom: '12px' }}>{project.category}</p>

        <p className="label">Due Date</p>
        <p className="secondary-text" style={{ marginBottom: '12px' }}>{project.dueDate}</p>

        <p className="label">Client</p>
        <p className="secondary-text" style={{ marginBottom: '12px' }}>{project.client}</p>

        <p className="label">Assigned Staff</p>
        <p className="secondary-text" style={{ marginBottom: '12px' }}>{project.assignedStaff.join(', ')}</p>

        <p className="label">Status</p>
        <span className={`pill ${getStatusClass(project.status)}`}>{project.status}</span>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="card-title">Tasks</h2>
          {isManager && (
            <button className="btn-primary" onClick={handleAddTaskClick}>
              + Task
            </button>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet.</p>
            {isManager && <p>Click "+ Task" to add a new task.</p>}
          </div>
        ) : (
          <div className="form"> {/* Using form class for gap spacing */}
            {tasks.map((task) => (
              <div
                key={task.id}
                className="card"
                style={{ padding: '12px', cursor: 'pointer' }}
                onClick={() => handleTaskClick(task)}
              >
                <h3 className="body-text" style={{ fontWeight: 600, marginBottom: '4px' }}>{task.title}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`pill ${getStatusClass(task.status)}`}>{task.status}</span>
                  <span className="secondary-text">Assignee: {task.assignee}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSave={(updatedProject) => {
            onEditProject(updatedProject.id); // Call parent handler to update project in state/API
            setShowEditModal(false);
          }}
        />
      )}

      {selectedTask && showTaskDetailModal && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setShowTaskDetailModal(false)}
          onUpdateTask={(updatedTask) => {
            onUpdateTask(updatedTask); // Call parent handler to update task in state/API
            setShowTaskDetailModal(false);
          }}
          onDeleteTask={(taskId) => {
            onDeleteTask(taskId); // Call parent handler to delete task in state/API
            setShowTaskDetailModal(false);
          }}
        />
      )}
    </div>
  );
};

export default ProjectDetailScreen;