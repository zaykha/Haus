import React, { useState } from 'react';
import { usePermissions } from '../utils/permissions'; // Assuming this utility exists

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

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

const EditProjectModal: React.FC<EditProjectModalProps> = ({ project, onClose, onSave }) => {
  const { isManager } = usePermissions();
  const [formData, setFormData] = useState<Project>(project);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isManager) { // Double-check permission on submit (server-side validation is crucial too)
      onSave(formData);
    } else {
      alert("You don't have permission to update this project.");
    }
  };

  if (!isManager) {
    // Optionally, render nothing or a permission denied message if modal is somehow opened for non-managers
    return null;
  }

  return (
    <div className="modal-overlay" style={modalOverlayStyle}>
      <div className="modal-content card" style={modalContentStyle}>
        <h2 className="card-title" style={{ marginBottom: '24px' }}>Edit Project</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="floating-field">
            <input
              id="projectName"
              name="name"
              placeholder=" "
              value={formData.name}
              onChange={handleChange}
            />
            <label htmlFor="projectName">Project Name</label>
          </div>

          <div className="floating-field">
            <textarea
              id="projectDescription"
              name="description"
              placeholder=" "
              value={formData.description}
              onChange={handleChange}
              className="textarea"
            ></textarea>
            <label htmlFor="projectDescription">Description</label>
          </div>

          <div className="floating-field">
            <input
              id="projectCategory"
              name="category"
              placeholder=" "
              value={formData.category}
              onChange={handleChange}
            />
            <label htmlFor="projectCategory">Category</label>
          </div>

          <div className="floating-field">
            <input
              id="projectDueDate"
              name="dueDate"
              type="date" // Assuming a date input for due date
              placeholder=" "
              value={formData.dueDate}
              onChange={handleChange}
            />
            <label htmlFor="projectDueDate">Due Date</label>
          </div>

          {/* Example for a select input for client */}
          <div className="floating-field">
            <select
              id="projectClient"
              name="client"
              value={formData.client}
              onChange={handleChange}
            >
              <option value="" disabled>Select Client</option>
              <option value="Client A">Client A</option>
              <option value="Client B">Client B</option>
            </select>
            <label htmlFor="projectClient">Client</label>
          </div>

          {/* Staff assignments would likely be a multi-select or a separate component */}
          <div className="floating-field">
            <input
              id="assignedStaff"
              name="assignedStaff"
              placeholder=" "
              value={formData.assignedStaff.join(', ')} // Display as comma-separated for now
              onChange={(e) => setFormData(prev => ({ ...prev, assignedStaff: e.target.value.split(',').map(s => s.trim()) }))}
            />
            <label htmlFor="assignedStaff">Assigned Staff (comma-separated)</label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Update Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Basic modal styling (should be in a global CSS file, but for example purposes)
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

export default EditProjectModal;