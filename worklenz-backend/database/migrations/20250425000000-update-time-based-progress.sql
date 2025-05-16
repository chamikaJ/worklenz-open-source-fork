-- Migration: Update time-based progress mode to work for all tasks
-- Date: 2025-04-25
-- Version: 1.0.0

BEGIN;

-- Create ENUM type for progress modes
CREATE TYPE PROGRESS_MODE_TYPE AS ENUM ('manual', 'weighted', 'time', 'default');

-- Add progress_mode column to tasks table
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS progress_mode PROGRESS_MODE_TYPE DEFAULT 'default';

-- Update function to use time-based progress for all tasks
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
    _use_weighted_progress BOOLEAN = FALSE;
    _use_time_progress BOOLEAN = FALSE;
    _task_complete    BOOLEAN = FALSE;
    _progress_mode    PROGRESS_MODE_TYPE;
BEGIN
    -- Check if manual progress is set for this task
    SELECT manual_progress, progress_value, project_id, progress_mode,
           EXISTS(
               SELECT 1
               FROM tasks_with_status_view
               WHERE tasks_with_status_view.task_id = tasks.id
               AND is_done IS TRUE
           ) AS is_complete
    FROM tasks 
    WHERE id = _task_id
    INTO _is_manual, _manual_value, _project_id, _progress_mode, _task_complete;
    
    -- Check if the project uses manual progress
    IF _project_id IS NOT NULL THEN
        SELECT COALESCE(use_manual_progress, FALSE),
               COALESCE(use_weighted_progress, FALSE),
               COALESCE(use_time_progress, FALSE)
        FROM projects
        WHERE id = _project_id
        INTO _use_manual_progress, _use_weighted_progress, _use_time_progress;
    END IF;
    
    -- Get all subtasks
    SELECT COUNT(*) 
    FROM tasks 
    WHERE parent_task_id = _task_id AND archived IS FALSE 
    INTO _sub_tasks_count;
    
    -- If task is complete, always return 100%
    IF _task_complete IS TRUE THEN
        RETURN JSON_BUILD_OBJECT(
            'ratio', 100,
            'total_completed', 1,
            'total_tasks', 1,
            'is_manual', FALSE
        );
    END IF;

    -- Determine current active mode
    DECLARE
        _current_mode PROGRESS_MODE_TYPE = CASE
            WHEN _use_manual_progress IS TRUE THEN 'manual'::PROGRESS_MODE_TYPE
            WHEN _use_weighted_progress IS TRUE THEN 'weighted'::PROGRESS_MODE_TYPE
            WHEN _use_time_progress IS TRUE THEN 'time'::PROGRESS_MODE_TYPE
            ELSE 'default'::PROGRESS_MODE_TYPE
        END;
    BEGIN
        -- Only use manual progress value if it was set in the current active mode
        -- or if the task is explicitly marked for manual progress
        IF (_is_manual IS TRUE AND _manual_value IS NOT NULL AND
            (_progress_mode IS NULL OR _progress_mode = _current_mode)) OR
           (_use_manual_progress IS TRUE AND _manual_value IS NOT NULL AND
            (_progress_mode IS NULL OR _progress_mode = 'manual'::PROGRESS_MODE_TYPE))
        THEN
            RETURN JSON_BUILD_OBJECT(
                'ratio', _manual_value,
                'total_completed', 0,
                'total_tasks', 0,
                'is_manual', TRUE
            );
        END IF;
    END;

    -- If there are no subtasks, calculate based on logged time vs estimated time
    IF _sub_tasks_count = 0 THEN
        IF _use_time_progress IS TRUE THEN
            -- Get the task's estimated time (in seconds) and logged time
            SELECT 
                COALESCE(total_minutes, 0) as estimated_seconds,
                COALESCE((
                    SELECT SUM(time_spent)
                    FROM task_work_log
                    WHERE task_id = _task_id
                ), 0) as logged_seconds
            FROM tasks
            WHERE id = _task_id
            INTO _ratio;

            -- Calculate progress based on logged time vs estimated time
            IF _ratio.estimated_seconds > 0 THEN
                _ratio = (_ratio.logged_seconds / _ratio.estimated_seconds) * 100;
            ELSE
                _ratio = 0;
            END IF;

            -- Ensure ratio doesn't exceed 100%
            IF _ratio > 100 THEN
                _ratio = 100;
            END IF;

            RETURN JSON_BUILD_OBJECT(
                'ratio', _ratio,
                'total_completed', 0,
                'total_tasks', 0,
                'is_manual', FALSE
            );
        END IF;
    END IF;

    -- For tasks with subtasks, calculate based on subtask progress
    IF _sub_tasks_count > 0 THEN
        IF _use_time_progress IS TRUE THEN
            WITH subtask_progress AS (
                SELECT 
                    t.id,
                    t.manual_progress,
                    t.progress_value,
                    t.progress_mode,
                    EXISTS(
                        SELECT 1
                        FROM tasks_with_status_view
                        WHERE tasks_with_status_view.task_id = t.id
                        AND is_done IS TRUE
                    ) AS is_complete,
                    COALESCE(t.total_minutes, 0) AS estimated_seconds,
                    COALESCE((
                        SELECT SUM(time_spent)
                        FROM task_work_log
                        WHERE task_id = t.id
                    ), 0) AS logged_seconds
                FROM tasks t
                WHERE t.parent_task_id = _task_id
                AND t.archived IS FALSE
            ),
            subtask_with_values AS (
                SELECT 
                    CASE 
                        -- For completed tasks, always use 100%
                        WHEN is_complete IS TRUE THEN 100
                        -- For tasks with progress value set in the correct mode, use it
                        WHEN progress_value IS NOT NULL AND 
                             (progress_mode = 'time'::PROGRESS_MODE_TYPE OR progress_mode IS NULL)
                            THEN progress_value
                        -- For time-based progress, calculate based on logged time
                        WHEN estimated_seconds > 0 THEN (logged_seconds / estimated_seconds) * 100
                        -- Default to 0 for incomplete tasks with no progress value
                        ELSE 0
                    END AS progress_value,
                    estimated_seconds
                FROM subtask_progress
            )
            SELECT COALESCE(
                SUM(progress_value * estimated_seconds) / NULLIF(SUM(estimated_seconds), 0),
                0
            )
            FROM subtask_with_values
            INTO _ratio;
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

-- Create a function to reset progress values when switching project progress modes
CREATE OR REPLACE FUNCTION reset_project_progress_values() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
DECLARE
    _old_mode   PROGRESS_MODE_TYPE;
    _new_mode   PROGRESS_MODE_TYPE;
    _project_id UUID;
BEGIN
    _project_id := NEW.id;

    -- Determine old and new modes
    _old_mode :=
        CASE
            WHEN OLD.use_manual_progress IS TRUE THEN 'manual'::PROGRESS_MODE_TYPE
            WHEN OLD.use_weighted_progress IS TRUE THEN 'weighted'::PROGRESS_MODE_TYPE
            WHEN OLD.use_time_progress IS TRUE THEN 'time'::PROGRESS_MODE_TYPE
            ELSE 'default'::PROGRESS_MODE_TYPE
        END;

    _new_mode :=
        CASE
            WHEN NEW.use_manual_progress IS TRUE THEN 'manual'::PROGRESS_MODE_TYPE
            WHEN NEW.use_weighted_progress IS TRUE THEN 'weighted'::PROGRESS_MODE_TYPE
            WHEN NEW.use_time_progress IS TRUE THEN 'time'::PROGRESS_MODE_TYPE
            ELSE 'default'::PROGRESS_MODE_TYPE
        END;

    -- If mode has changed, reset progress values for tasks with the old mode
    IF _old_mode <> _new_mode THEN
        -- Reset progress values for tasks that were set in the old mode
        UPDATE tasks
        SET progress_value = NULL,
            progress_mode = NULL
        WHERE project_id = _project_id
          AND progress_mode = _old_mode;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger to reset progress values when project progress mode changes
DROP TRIGGER IF EXISTS reset_progress_on_mode_change ON projects;
CREATE TRIGGER reset_progress_on_mode_change
    AFTER UPDATE OF use_manual_progress, use_weighted_progress, use_time_progress
    ON projects
    FOR EACH ROW
EXECUTE FUNCTION reset_project_progress_values();

COMMIT; 