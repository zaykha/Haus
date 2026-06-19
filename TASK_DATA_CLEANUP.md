# Task Data Cleanup

This cleanup keeps:

- `client_organizations`
- `profiles`
- `project_members`
- `projects`

It removes task-related data only.

## Database Cleanup

Use this to delete all tasks and the associated task/history records stored in database tables:

```sql
begin;

delete from public.project_activity;
delete from public.project_feedback;
delete from public.project_comments;
delete from public.project_files;
delete from public.tasks;

commit;
```

## Storage Cleanup

Task deliverables are uploaded to the Supabase Storage bucket `task-deliverables` by default.

Deleting task rows does not automatically remove the uploaded storage objects, so run this too if you want a full cleanup:

```sql
delete from storage.objects
where bucket_id = 'task-deliverables'
  and name like 'deliverables/%';
```

If your bucket name is customized via environment variables, replace `task-deliverables` with the actual bucket name.

## Full Cleanup

Use this if you want both database cleanup and storage cleanup together:

```sql
begin;

delete from storage.objects
where bucket_id = 'task-deliverables'
  and name like 'deliverables/%';

delete from public.project_activity;
delete from public.project_feedback;
delete from public.project_comments;
delete from public.project_files;
delete from public.tasks;

commit;
```

## Important Schema Note

In the current schema:

- `project_activity`
- `project_feedback`
- `project_comments`
- `project_files`

are project-level tables, not task-level tables.

That means this cleanup removes all history/files/feedback/comments across projects, while still keeping the project records themselves.
