-- ============================================================
-- 我们的日志本 —— Supabase 数据库初始化脚本
-- 使用方法：Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 1. 建表
create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  content text not null,
  tags text[] not null default '{}',
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 索引
create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_user_id_idx on public.logs (user_id);
-- 标签用 GIN 索引（数据量小，可选）
create index if not exists logs_tags_idx on public.logs using gin (tags);

-- 3. updated_at 自动更新时间
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists logs_set_updated_at on public.logs;
create trigger logs_set_updated_at
  before update on public.logs
  for each row
  execute function public.set_updated_at();

-- 4. 开启行级安全（RLS）
alter table public.logs enable row level security;

-- 所有人可读
drop policy if exists "logs_public_select" on public.logs;
create policy "logs_public_select" on public.logs
  for select using (true);

-- 登录（含匿名）用户只能插入自己的记录
drop policy if exists "logs_insert_own" on public.logs;
create policy "logs_insert_own" on public.logs
  for insert with check (auth.uid() = user_id);

-- 只能更新自己的记录
drop policy if exists "logs_update_own" on public.logs;
create policy "logs_update_own" on public.logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 只能删除自己的记录
drop policy if exists "logs_delete_own" on public.logs;
create policy "logs_delete_own" on public.logs
  for delete using (auth.uid() = user_id);

-- 5. 开启 Realtime（把 logs 表加入 supabase_realtime 发布）
-- 幂等写法：先判断是否已在发布里，避免重复执行时报 42710 错误。
-- 也可到控制台手动开启：Database → Replication → Publications → supabase_realtime → 勾选 logs。
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'logs'
  ) then
    alter publication supabase_realtime add table public.logs;
  end if;
end
$$;

-- 6.（可选）让 DELETE 事件也携带旧行数据，便于调试
-- 默认只用主键 id 即可完成删除同步，一般无需开启：
-- alter table public.logs replica identity full;

-- 7. 图片存储（发布日志时上传图片，Supabase Storage 免费额度 1GB）
-- 创建公开图片存储桶（幂等）
insert into storage.buckets (id, name, public)
values ('log-images', 'log-images', true)
on conflict (id) do nothing;

-- 所有人可读（公开桶）
drop policy if exists "log_images_public_read" on storage.objects;
create policy "log_images_public_read" on storage.objects
  for select using (bucket_id = 'log-images');

-- 登录（含匿名）用户可上传
drop policy if exists "log_images_insert_own" on storage.objects;
create policy "log_images_insert_own" on storage.objects
  for insert with check (bucket_id = 'log-images' and auth.role() = 'authenticated');

-- 只能删除自己上传的图片（删除日志时清理用）
drop policy if exists "log_images_delete_own" on storage.objects;
create policy "log_images_delete_own" on storage.objects
  for delete using (bucket_id = 'log-images' and owner = auth.uid());
