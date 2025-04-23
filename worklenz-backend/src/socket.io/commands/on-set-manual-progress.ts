import { Server, Socket } from "socket.io";
import { SocketEvents } from "../events";
import { log_error, notifyProjectUpdates } from "../util";
import TasksControllerV2 from "../../controllers/tasks-controller-v2";
import db from "../../config/db";

export async function on_set_manual_progress(_io: Server, socket: Socket, data?: {
  task_id: string;
  enable_manual: boolean;
  progress_value: number;
  team_id: string;
}) {
  try {
    if (!data?.task_id) {
      socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
        success: false,
        error: "Task ID is required"
      });
      return;
    }
    
    // Validate progress value
    if (data.enable_manual && (data.progress_value < 0 || data.progress_value > 100)) {
      socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
        success: false,
        error: "Progress value must be between 0 and 100"
      });
      return;
    }
    
    // Get task data to check if it's a subtask
    const taskResult = await db.query(
      "SELECT parent_task_id FROM tasks WHERE id = $1",
      [data.task_id]
    );
    
    if (taskResult.rows.length === 0) {
      socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
        success: false,
        error: "Task not found"
      });
      return;
    }
    
    const taskData = taskResult.rows[0];
    
    // Don't allow manual progress on subtasks
    if (taskData.parent_task_id) {
      socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
        success: false,
        error: "Manual progress cannot be set on subtasks"
      });
      return;
    }
    
    // Update the task
    await db.query(
      "UPDATE tasks SET manual_progress = $1, progress_value = $2 WHERE id = $3",
      [data.enable_manual, data.enable_manual ? data.progress_value : null, data.task_id]
    );
    
    // Get updated task info
    const info = await TasksControllerV2.getTaskCompleteRatio(data.task_id);
    
    // Send the response
    socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
      success: true,
      task_id: data.task_id,
      manual_progress: data.enable_manual,
      complete_ratio: info?.ratio || 0,
      is_manual: data.enable_manual
    });
    
    // Also send standard progress update for compatibility
    socket.emit(SocketEvents.GET_TASK_PROGRESS.toString(), {
      id: data.task_id,
      complete_ratio: info?.ratio || 0,
      completed_count: info?.total_completed || 0,
      total_tasks_count: info?.total_tasks || 0,
      is_manual: info?.is_manual || false
    });
    
    // Notify project updates
    notifyProjectUpdates(socket, data.task_id);
  } catch (error) {
    log_error(error);
    socket.emit(SocketEvents.SET_MANUAL_PROGRESS.toString(), {
      success: false,
      error: "Failed to update progress"
    });
  }
} 