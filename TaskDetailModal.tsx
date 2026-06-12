import React, { useState } from 'react';
import { useAppState } from "@/components/app-state";
import { canManageWorkspace } from "@/lib/permissions";


interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  assignee: string;
  dueDate?: string;
}

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onUpdateTask: (updatedTask: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, onUpdateTask, onDeleteTask }) => {
  const { user } = useAppState();

  const isManager = user ? canManageWorkspace(user.role) : false;

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Task>(task);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleDeleteClick = () => {
    if (window.confirm(`Are you sure you want to delete task "${task.title}"?`)) {
      onDeleteTask(task.id);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isManager) { // Double-check permission on submit (server-side validation is crucial too)
      onUpdateTask(formData);
      setIsEditing(false);
    } else {
      alert("You don't have permission to update this task.");
    }
  };

  const getStatusClass = (status: Task['status']) => {
    switch (status) {
      case 'In Progress':
        return 'status-active';
      case 'Pending':
        return 'status-waiting';
      case 'Completed':
        return 'status-completed';
      default:
        return '';
    }
  };

  return (
    <div className="modal-overlay" style={modalOverlayStyle}>
      <div className="modal-content card" style={modalContentStyle}>
        <h2 className="card-title" style={{ marginBottom: '24px' }}>Task Details</h2>

        {isEditing && isManager ? (
          <form onSubmit={handleSave} className="form">
            <div className="floating-field">
              <input
                id="taskTitle"
                name="title"
                placeholder=" "
                value={formData.title}
                onChange={handleChange}
              />
              <label htmlFor="taskTitle">Task Title</label>
            </div>

            <div className="floating-field">
              <textarea
                id="taskDescription"
                name="description"
                placeholder=" "
                value={formData.description || ''}
                onChange={handleChange}
                className="textarea"
              ></textarea>
              <label htmlFor="taskDescription">Description</label>
            </div>

            <div className="floating-field">
              <select
                id="taskStatus"
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
              <label htmlFor="taskStatus">Status</label>
            </div>

            <div className="floating-field">
              <input
                id="taskAssignee"
                name="assignee"
                placeholder=" "
                value={formData.assignee}
                onChange={handleChange}
              />
              <label htmlFor="taskAssignee">Assignee</label>
            </div>

            <div className="floating-field">
              <input
                id="taskDueDate"
                name="dueDate"
                type="date"
                placeholder=" "
                value={formData.dueDate || ''}
                onChange={handleChange}
              />
              <label htmlFor="taskDueDate">Due Date</label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="label">Title</p>
            <p className="body-text" style={{ marginBottom: '12px' }}>{task.title}</p>

            {task.description && (
              <>
                <p className="label">Description</p>
                <p className="body-text" style={{ marginBottom: '12px' }}>{task.description}</p>
              </>
            )}

            <p className="label">Status</p>
            <span className={`pill ${getStatusClass(task.status)}`} style={{ marginBottom: '12px' }}>{task.status}</span>

            <p className="label">Assignee</p>
            <p className="secondary-text" style={{ marginBottom: '12px' }}>{task.assignee}</p>

            {task.dueDate && (
              <>
                <p className="label">Due Date</p>
                <p className="secondary-text" style={{ marginBottom: '12px' }}>{task.dueDate}</p>
              </>
            )}

            {isManager && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                <button className="btn-ghost" onClick={handleEditClick}>
                  Update Task
                </button>
                <button className="btn-danger" onClick={handleDeleteClick}>
                  Delete Task
                </button>
              </div>
            )}
          </>
        )}
        <button className="btn-ghost" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}>
          Close
        </button>
      </div>
    </div>
  );
};

// Reusing modal styles from EditProjectModal
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  borderRadius: 'var(--radius-xl)', // 24px
  padding: '24px',
  width: '90%',
  maxWidth: '500px',
  boxShadow: 'var(--shadow-lg)',
  maxHeight: '90vh',
  overflowY: 'auto',
};

export default TaskDetailModal;