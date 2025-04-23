import { ITaskAssignee } from "../tasks/task.types";

export interface ITask {
  id?: string;
  name?: string;
  description?: string;
  complete_ratio?: number;
  completed_count?: number;
  total_tasks_count?: number;
  is_manual?: boolean;
  status_id?: string;
  status_name?: string;
  priority_id?: string;
  priority_name?: string;
  start_date?: string;
  end_date?: string;
  assignees?: ITaskAssignee[];
  labels?: any[];
  sub_tasks?: any[];
  sub_tasks_count?: number;
  parent_task_id?: string;
  is_sub_task?: boolean;
} 