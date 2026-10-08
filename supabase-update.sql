-- ============================================================
-- 升级脚本：为已建好的项目添加「图片上传」功能
-- 使用方法：Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- （全新项目不需要跑这个，直接跑 supabase.sql 即可）
-- ============================================================

-- 1. logs 表新增 images 列（保存图片公开 URL 列表，幂等）
alter table public.logs add column if not exists images text[] not null default '{}';

-- 2. 创建公开图片存储桶（幂等）
insert into storage.buckets (id, name, public)
values ('log-images', 'log-images', true)
on conflict (id) do nothing;

-- 3. 存储策略：所有人可读（公开桶）
drop policy if exists "log_images_public_read" on storage.objects;
create policy "log_images_public_read" on storage.objects
  for select using (bucket_id = 'log-images');

-- 4. 存储策略：登录（含匿名）用户可上传
drop policy if exists "log_images_insert_own" on storage.objects;
create policy "log_images_insert_own" on storage.objects
  for insert with check (bucket_id = 'log-images' and auth.role() = 'authenticated');

-- 5. 存储策略：只能删除自己上传的图片（删除日志时清理用）
drop policy if exists "log_images_delete_own" on storage.objects;
create policy "log_images_delete_own" on storage.objects
  for delete using (bucket_id = 'log-images' and owner = auth.uid());
