import db from "../../config/db";

/**
 * Update the weight of a task in the database
 * @param taskId - ID of the task to update
 * @param weight - New weight value (positive integer)
 * @returns Object with success status and message
 */
export const updateTaskWeight = async (
  taskId: string,
  weight: number
): Promise<{ success: boolean; message: string }> => {
  try {
    // Ensure weight is at least 1
    const weightValue = Math.max(1, Math.round(weight));
    
    // Update the task weight in the database
    const result = await db.query(
      `UPDATE tasks 
       SET weight = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [weightValue, taskId]
    );
    
    if (result.rowCount === 0) {
      return {
        success: false,
        message: 'Task not found'
      };
    }
    
    return {
      success: true,
      message: 'Task weight updated successfully'
    };
  } catch (error) {
    console.error('Error updating task weight:', error);
    return {
      success: false,
      message: 'Failed to update task weight'
    };
  }
}; 