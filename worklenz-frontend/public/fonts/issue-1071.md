[Feature]: Software Project Type with Backlog, Sprints, and Dev-Friendly Terminology

Problem or Need
Worklenz currently uses generic project-management terminology and flows such as Tasks, Phases, and Task List. While the current UI is flexible, it does not feel native to software teams who are used to Jira- or Linear-style workflows.

For software teams, the current experience has a few problems:
• “Phase” is not a natural concept for engineering execution
• “Task List” does not clearly separate planning from execution
• There is no dedicated backlog planning experience
• There is no sprint-based workflow for organizing upcoming work
• The terminology does not align with how developers think about issues, backlog, status, assignee, and sprint
• The current grouping model mixes concepts that should be more explicit in software projects

This creates friction for engineering teams evaluating Worklenz for issue tracking and sprint planning. We need a dedicated Software Project Type that reuses the existing UI components but presents them in a way that feels familiar to software teams, with a Jira-style structure and a lighter, cleaner Linear-style experience.

Proposed Solution
Introduce a new Software Project Type that reuses the existing components and views, but changes terminology, defaults, and behavior to support software delivery workflows.

When a project is created as a Software Project:
• Task becomes Issue
• Task List becomes Backlog
• Phase becomes Sprint
• Manage Phase becomes Manage Sprints
• default grouping becomes Status
• software-friendly statuses are preconfigured
• software-relevant tabs are prioritized

Dev-friendly terminology
Update labels and naming across the project type to match software team expectations.

Suggested terminology changes:
• Task → Issue
• Add Task → Create Issue
• Task List → Backlog
• Phase → Sprint
• Manage Phase → Manage Sprints
• Members filter can remain as-is, but Assignee should be emphasized in issue context
• Unmapped → Backlog, where relevant during migration or fallback states

Backlog as a dedicated tab
Add a dedicated Backlog tab for Software Projects.

Purpose of the Backlog tab:
• show issues not assigned to a sprint
• support prioritization and planning
• provide a clean flat list optimized for reordering
• support quick creation of issues
• support assigning issues into sprints

Backlog should be a separate tab, not just a grouping inside Task List.

Sprint support
Replace the existing software-project usage of “Phase” with Sprint.

Minimum sprint model:
• Sprint name
• Start date
• End date
• Status: Planned / Active / Completed

Sprint behavior:
• issues can optionally belong to a sprint
• unassigned issues remain in Backlog
• board and other views can be filtered by sprint
• grouping option includes Sprint

Grouping updates
For Software Projects, update grouping options to:
• Status
• Priority
• Sprint
• Assignee
• None (optional, if supported cleanly)

This removes the ambiguous “Phase” concept and replaces it with a more meaningful software construct.

Software workflow defaults
Default statuses for Software Projects:
• Backlog
• Todo
• In Progress
• In Review
• Done
• Blocked

This keeps the workflow familiar to software teams while staying lightweight.

Add to Sprint flow
Support assigning issues from Backlog into a sprint.

MVP interaction:
• each backlog issue has a Sprint selector
• user can assign an issue to a sprint from a dropdown
• once assigned, issue appears in sprint-filtered views
• optionally, issue status can auto-move from Backlog to Todo when added to a sprint

Future enhancement:
• drag and drop from Backlog into Sprint buckets

Tabs for Software Projects
Prioritize software-relevant tabs for this project type.

Suggested tabs:
• Backlog
• Board
• Roadmap
• Insights
• Files
• Members
• Updates

Tabs like Finance and Workload can be hidden or deprioritized for Software Projects if they are not relevant to the intended workflow.

Reuse existing UI components
This feature should primarily reuse the current list/table/filter/grouping components instead of introducing a new design system.

Main changes should be:
• terminology
• default behavior
• new Backlog tab behavior
• Sprint entity and assignment flow
• software-specific defaults

This keeps implementation lean while making the product feel purpose-built for engineering teams.

Milestones
Implement this feature in milestones to reduce risk and ship value incrementally.

Milestone 1 — Software terminology and project-type scaffolding
• introduce Software Project Type
• rename UI labels for software projects
• map Task → Issue, Phase → Sprint, Task List → Backlog
• update software-specific default statuses
• update grouping options for software projects

Milestone 2 — Backlog tab
• add Backlog as a dedicated tab
• show issues with no sprint assignment
• support issue creation from Backlog
• support flat-list prioritization and ordering

Milestone 3 — Sprint management
• add Sprint entity
• add Manage Sprints flow
• support sprint creation, editing, and lifecycle states
• allow issues to be assigned to sprints

Milestone 4 — Add to Sprint workflow
• add sprint selector on backlog issues
• allow assigning/removing issues from sprints
• add sprint filtering on Board and related views
• optionally auto-transition status from Backlog to Todo when added to sprint

Milestone 5 — UX refinement
• polish labels, empty states, and software-specific defaults
• improve consistency across Backlog, Board, and filters
• evaluate bulk actions and drag/drop enhancements
• prepare for future additions such as issue types, issue IDs, and Git integration

Alternatives Considered
1. Keep the current generic project structure and only rename Phase

•	Too limited
•	Does not solve the lack of backlog and sprint planning
•	Still feels like generic project management instead of software delivery

2.	Keep Backlog as only a grouped section inside Task List

•	Reuses the current UI easily
•	But does not create a dedicated planning experience
•	Makes backlog feel secondary instead of core to software workflows

3.	Build a fully new Jira-style software module from scratch

•	Would allow full customization
•	But adds significant implementation cost and complexity
•	Not necessary because the existing components already cover most of the required structure

4.	Use Sprint only as a label and not a real entity

•	Easy to implement
•	But would feel fake to software teams
•	Sprint should have at least minimal structure and assignment behavior
The proposed solution is the best balance between familiarity, implementation speed, and product quality.

Additional Context
This request is intended to make Worklenz feel familiar to software teams without turning it into a heavy Jira clone.

The desired direction is:
• Jira familiarity in concepts such as backlog, sprint, status, and board
• Linear-like simplicity, speed, and reduced configuration overhead
• maximum reuse of existing components
• minimal disruption to current architecture

This should become the foundation for future software-project capabilities such as:
• issue types like Feature, Bug, Task
• issue IDs like WL-123
• issue detail side panel
• sprint planning improvements
• GitHub/GitLab integration
• PR/review-aware workflow states