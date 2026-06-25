# Chat Image Attachments SQL

Run this in Supabase before using chat image attachments:

```sql
alter table public.chat_messages
  add column if not exists image_url text,
  add column if not exists image_name text,
  add column if not exists image_mime_type text,
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null;

alter publication supabase_realtime add table public.chat_messages;
```

Optional bucket setup if you want to create the bucket manually instead of letting the API route create it:

```sql
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;
```

If your Storage policies are restrictive, ensure authenticated users can upload into `chat-images` and everyone who can view chat can read the objects.
