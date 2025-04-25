-- Add weight column to tasks table
ALTER TABLE tasks
ADD COLUMN weight INTEGER NOT NULL DEFAULT 1;

-- Add migration record
INSERT INTO migrations (name) VALUES ('add-task-weight'); 