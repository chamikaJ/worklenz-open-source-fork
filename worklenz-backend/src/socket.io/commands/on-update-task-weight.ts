import { Socket } from 'socket.io';
import { updateTaskWeight } from '../../controllers/tasks/update-task-weight';
import { SocketEvents } from '../events';

interface UpdateTaskWeightDTO {
  task_id: string;
  weight: number;
}

export const onUpdateTaskWeight = (socket: Socket) => {
  socket.on(SocketEvents.UPDATE_TASK_WEIGHT.toString(), async (data: UpdateTaskWeightDTO) => {
    try {
      // Extract data
      const { task_id, weight } = data;
      
      // Validate required fields
      if (!task_id) {
        socket.emit(SocketEvents.UPDATE_TASK_WEIGHT.toString(), {
          success: false,
          message: 'Task ID is required'
        });
        return;
      }
      
      // Validate weight
      const weightValue = parseInt(weight.toString(), 10);
      if (isNaN(weightValue) || weightValue < 1) {
        socket.emit(SocketEvents.UPDATE_TASK_WEIGHT.toString(), {
          success: false,
          message: 'Weight must be a positive integer'
        });
        return;
      }
      
      // Update the task weight
      const result = await updateTaskWeight(task_id, weightValue);
      
      // Respond to client
      socket.emit(SocketEvents.UPDATE_TASK_WEIGHT.toString(), {
        success: result.success,
        message: result.message,
        task_id
      });
      
      // Notify other clients that task data has changed
      if (result.success) {
        socket.broadcast.emit(SocketEvents.GET_TASK_PROGRESS.toString(), {
          id: task_id,
          weight: weightValue
        });
      }
    } catch (error) {
      console.error('Error updating task weight:', error);
      socket.emit(SocketEvents.UPDATE_TASK_WEIGHT.toString(), {
        success: false,
        message: 'An error occurred while updating task weight'
      });
    }
  });
}; 