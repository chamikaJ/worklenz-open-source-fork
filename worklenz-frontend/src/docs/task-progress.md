# Task Progress Calculation Feature

This document provides an overview of how task progress is calculated in the Worklenz application.

## Progress Modes

There are two progress tracking modes in Worklenz:

1. **Automatic Mode** - Progress is automatically calculated based on the completion of subtasks.
2. **Manual Mode** - Progress is set manually by the user, initially based on the average of subtask progress.

## Subtask Progress Aggregation

When a task has subtasks, the progress can be calculated in different ways:

### Automatic Calculation (Default)

In automatic mode, the parent task's progress is automatically calculated based on the completion status of its subtasks. In this mode, individual subtask progress is not highlighted in the UI.

### Manual with Weighted Average

When switching to manual mode for a parent task:

1. The system automatically calculates the average progress from all subtasks
2. This average is applied as the initial value for the parent task's manual progress
3. The user can then adjust this value as needed
4. Individual subtask progress becomes visible in the UI

### Subtask Visibility and Contributions

Subtask progress display follows these rules:

- Subtask progress is only visible when the parent task is in manual mode
- When visible, each subtask shows its contribution to the parent task's progress
- Each subtask contributes equally to the parent task's progress (equal weighting)

## Implementation Details

The aggregation logic is implemented in:

- `task-progress-utils.ts` - Contains utility functions for calculating progress
- `task-progress-editor.tsx` - Automatically applies subtask average when switching to manual mode
- `subtask-progress-cell.tsx` - Shows/hides subtask progress based on parent's mode

## How to Use

1. Open the task progress editor by clicking on a task's progress circle
2. Switch to manual mode to see the calculated average from subtasks
3. Adjust the value if needed and save your changes
4. Individual subtask progress will now be visible in the task list

The reversal of the traditional logic (showing subtasks only in manual mode instead of auto mode) allows for a clearer separation of responsibilities:

- In auto mode, only the parent task's overall progress matters
- In manual mode, you can see how individual subtasks contribute to the average
