-- ============================================================
--  评论回复「站内信」通知 —— Supabase SQL（在 SQL Editor 里整段执行一次）
--  作用：别人回复你的评论时，自动往 notifications 表写一条通知
--  前端随后就能实时读到（我下一步接上读取与展示）
-- ============================================================

-- 1) 通知表
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                 -- 收件人（被回复的人）
  actor_id    uuid,                          -- 触发人（回复的人）
  actor_name  text,                           -- 触发人昵称（冗余存一份，方便显示）
  kind        text default 'reply',
  artwork_id  text,
  comment_id  uuid,
  body        text,
  created_at  timestamptz default now(),
  read        boolean default false
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- 2) 行级安全：本人只能看/改自己的通知
alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications
  for delete to authenticated using (auth.uid() = user_id);

-- 触发器由数据库自己写入，所以允许插入（不开放给匿名）
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications
  for insert to authenticated with check (true);

-- 3) 触发器函数：解析回复前缀 ⟨r:父评论id⟩，找出被回复者并写入通知
create or replace function public.notify_comment_reply()
returns trigger as $$
declare
  v_pid     uuid;
  v_target  uuid;
  v_name    text;
  v_art     text;
begin
  -- 只有带回复前缀的评论才算回复
  if new.content is null or left(new.content, 3) <> '⟨r:' then
    return new;
  end if;

  -- 取出父评论 id（前缀形如 ⟨r:xxxxxxxx-xxxx-...⟩）
  begin
    v_pid := substring(new.content from '^⟨r:([0-9a-fA-F-]{36})⟩')::uuid;
  exception when others then
    v_pid := null;
  end;
  if v_pid is null then return new; end if;

  -- 找到被回复评论的作者（列名做了兜底，兼容 artwork_id / artwork / art_id）
  select (to_jsonb(c)->>'user_id')::uuid into v_target
    from public.comments c where c.id = v_pid;
  if v_target is null or v_target = new.user_id then return new; end if;

  -- 昵称（拿不到就留空，前端会显示"有人"）
  begin
    select nickname into v_name from public.profiles where id = new.user_id;
  exception when others then v_name := null;
  end;

  v_art := coalesce(to_jsonb(new)->>'artwork_id', to_jsonb(new)->>'artwork', to_jsonb(new)->>'art_id');

  insert into public.notifications(user_id, actor_id, actor_name, kind, artwork_id, comment_id, body)
  values (v_target, new.user_id, coalesce(v_name, '有人'), 'reply', v_art, new.id, new.content);

  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_comment_reply on public.comments;
create trigger trg_comment_reply
  after insert on public.comments
  for each row execute function public.notify_comment_reply();

-- 完成。测试：用另一个账号回复你的评论，然后查
--   select * from public.notifications order by created_at desc limit 5;
