-- Migration: Enhance manual task progress with subtask support
-- Date: 2025-04-23
-- Version: 1.0.0

BEGIN;

-- Update function to consider subtask manual progress when calculating parent task progress
CREATE OR REPLACE FUNCTION get_task_complete_ratio(_task_id uuid) RETURNS json
    LANGUAGE plpgsql
AS
$$
DECLARE
    _parent_task_done FLOAT = 0;
    _sub_tasks_done   FLOAT = 0;
    _sub_tasks_count  FLOAT = 0;
    _total_completed  FLOAT = 0;
    _total_tasks      FLOAT = 0;
    _ratio            FLOAT = 0;
    _is_manual        BOOLEAN = FALSE;
    _manual_value     INTEGER = NULL;
    _project_id       UUID;
    _use_manual_progress BOOLEAN = FALSE;
BEGIN
    -- Check if manual progress is set for this task
    SELECT manual_progress, progress_value, project_id
    FROM tasks 
    WHERE id = _task_id
    INTO _is_manual, _manual_value, _project_id;
    
    -- Check if the project uses manual progress
    IF _project_id IS NOT NULL THEN
        SELECT COALESCE(use_manual_progress, FALSE)
        FROM projects
        WHERE id = _project_id
        INTO _use_manual_progress;
    END IF;
    
    -- If manual progress is enabled and has a value, use it directly
    IF _is_manual IS TRUE AND _manual_value IS NOT NULL THEN
        RETURN JSON_BUILD_OBJECT(
            'ratio', _manual_value,
            'total_completed', 0,
            'total_tasks', 0,
            'is_manual', TRUE
        );
    END IF;
    
    -- Get all subtasks
    SELECT COUNT(*) 
    FROM tasks 
    WHERE parent_task_id = _task_id AND archived IS FALSE 
    INTO _sub_tasks_count;
    
    -- If there are no subtasks, just use the parent task's status
    IF _sub_tasks_count = 0 THEN
        SELECT (CASE
                    WHEN EXISTS(SELECT 1
                                FROM tasks_with_status_view
                                WHERE tasks_with_status_view.task_id = _task_id
                                  AND is_done IS TRUE) THEN 1
                    ELSE 0 END)
        INTO _parent_task_done;
        
        _ratio = _parent_task_done * 100;
    ELSE
        -- If project uses manual progress, calculate based on subtask manual progress values
        IF _use_manual_progress IS TRUE THEN
            WITH subtask_progress AS (
                SELECT 
                    CASE 
                        -- If subtask has manual progress, use that value
                        WHEN manual_progress IS TRUE AND progress_value IS NOT NULL THEN 
                            progress_value
                        -- Otherwise use completion status (0 or 100)
                        ELSE
                            CASE 
                                WHEN EXISTS(
                                    SELECT 1
                                    FROM tasks_with_status_view
                                    WHERE tasks_with_status_view.task_id = t.id
                                    AND is_done IS TRUE
                                ) THEN 100
                                ELSE 0
                            END
                    END AS progress_value
                FROM tasks t
                WHERE t.parent_task_id = _task_id
                AND t.archived IS FALSE
            )
            SELECT COALESCE(AVG(progress_value), 0)
            FROM subtask_progress
            INTO _ratio;
        ELSE
            -- Traditional calculation based on completion status
            SELECT (CASE
                        WHEN EXISTS(SELECT 1
                                    FROM tasks_with_status_view
                                    WHERE tasks_with_status_view.task_id = _task_id
                                      AND is_done IS TRUE) THEN 1
                        ELSE 0 END)
            INTO _parent_task_done;
            
            SELECT COUNT(*)
            FROM tasks_with_status_view
            WHERE parent_task_id = _task_id
              AND is_done IS TRUE
            INTO _sub_tasks_done;
            
            _total_completed = _parent_task_done + _sub_tasks_done;
            _total_tasks = _sub_tasks_count + 1; -- +1 for the parent task
            
            IF _total_tasks = 0 THEN
                _ratio = 0;
            ELSE
                _ratio = (_total_completed / _total_tasks) * 100;
            END IF;
        END IF;
    END IF;
    
    -- Ensure ratio is between 0 and 100
    IF _ratio < 0 THEN
        _ratio = 0;
    ELSIF _ratio > 100 THEN
        _ratio = 100;
    END IF;

    RETURN JSON_BUILD_OBJECT(
        'ratio', _ratio,
        'total_completed', _total_completed,
        'total_tasks', _total_tasks,
        'is_manual', _is_manual
    );
END
$$;

-- Add use_manual_progress and use_weighted_progress to projects table if they don't exist
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS use_manual_progress BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS use_weighted_progress BOOLEAN DEFAULT FALSE;

COMMIT; 