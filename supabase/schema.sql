-- ============================================================
--  Pastel Memories · Supabase 데이터베이스 설정 (v2: 카카오·구글 로그인)
--  Supabase 대시보드 → SQL Editor → 이 파일 내용을 전부 붙여넣고 [Run]
--  (여러 번 실행해도 안전해요)
-- ============================================================

-- ---------- 표(테이블) ----------

create table if not exists public.families (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 40),
  baby_name       text not null default '' check (char_length(baby_name) <= 20),
  baby_birthday   date,
  invite_code     text not null unique,
  storage         text not null default 'supabase' check (storage in ('supabase', 'drive')),
  drive_folder_id text,
  drive_email     text,
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now()
);
-- v1에서 올린 경우를 위해 (여러 번 실행해도 안전)
alter table public.families add column if not exists storage text not null default 'supabase';
alter table public.families add column if not exists drive_folder_id text;
alter table public.families add column if not exists drive_email text;
alter table public.families drop constraint if exists families_storage_check;
alter table public.families add constraint families_storage_check check (storage in ('supabase', 'drive'));

create table if not exists public.members (
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  avatar       text not null default '',
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists members_user_idx on public.members (user_id);
-- 얼굴 사진: 비어 있음 / 카카오·구글 프로필 사진 주소 / 내가 올린 사진 'sb:가족ID/avatars/내ID-시각.jpg'
alter table public.members alter column avatar set default '';
alter table public.members drop constraint if exists members_avatar_check;
-- v1의 이모지 얼굴(🙂 등)과 'img:' 사진은 새 규칙에 맞지 않아서 비워요 (이름 첫 글자로 보여요)
update public.members set avatar = ''
where not (
  avatar = ''
  or (char_length(avatar) <= 600 and avatar ~ '^https://([a-z0-9-]+\.)*(googleusercontent\.com|kakaocdn\.net|kakao\.com)/')
  or avatar ~ ('^sb:' || family_id::text || '/avatars/' || user_id::text || '-[0-9]+\.jpg$'));
alter table public.members add constraint members_avatar_check check (
  avatar = ''
  or (char_length(avatar) <= 600 and avatar ~ '^https://([a-z0-9-]+\.)*(googleusercontent\.com|kakaocdn\.net|kakao\.com)/')
  or avatar ~ ('^sb:' || family_id::text || '/avatars/' || user_id::text || '-[0-9]+\.jpg$'));

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  author_id  uuid not null default auth.uid(),
  caption    text not null default '' check (char_length(caption) <= 2000),
  taken_at   timestamptz not null default now(),
  -- [{ "path", "thumb", "orig"?, "w", "h", "ph", "dec", "origName"?, "origSize"? }]
  -- 경로: Supabase 저장소면 '가족ID/게시물ID/0.jpg', 구글 드라이브면 'drive:파일ID'
  photos     jsonb not null check (jsonb_typeof(photos) = 'array'
                                   and jsonb_array_length(photos) between 1 and 10
                                   and pg_column_size(photos) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists posts_family_created_idx on public.posts (family_id, created_at desc);

create table if not exists public.likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists likes_family_created_idx on public.likes (family_id, created_at desc);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  author_id  uuid not null default auth.uid(),
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_family_created_idx on public.comments (family_id, created_at desc);

-- 구글 드라이브 연결 정보 (앱에서는 절대 못 읽어요. 서버 기능(Edge Function)만 사용)
create table if not exists public.drive_tokens (
  family_id     uuid primary key references public.families(id) on delete cascade,
  refresh_token text not null,
  connected_by  uuid not null,
  updated_at    timestamptz not null default now()
);

-- ---------- 도우미 함수 ----------

create or replace function public.is_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.is_owner(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where family_id = fid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_member_path(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members
                 where family_id::text = split_part(path, '/', 1) and user_id = auth.uid());
$$;

create or replace function public.is_owner_path(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members
                 where family_id::text = split_part(path, '/', 1) and user_id = auth.uid() and role = 'owner');
$$;

-- 익명(로그인 안 한) 사용자인가?
create or replace function public.is_guest()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- 헷갈리는 글자(0/O, 1/I)를 뺀 8자리 초대 코드
create or replace function public.gen_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  code text := '';
  i int;
begin
  foreach i in array idx loop
    code := code || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return code;
end $$;

create or replace function public.fill_family_from_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select family_id into new.family_id from posts where id = new.post_id;
  return new;
end $$;

drop trigger if exists likes_fill_family on public.likes;
create trigger likes_fill_family before insert on public.likes
  for each row execute function public.fill_family_from_post();
drop trigger if exists comments_fill_family on public.comments;
create trigger comments_fill_family before insert on public.comments
  for each row execute function public.fill_family_from_post();

-- 게시물의 사진 경로는 반드시 자기 게시물 폴더(또는 구글 드라이브 파일)여야 해요
create or replace function public.check_post_photos()
returns trigger language plpgsql set search_path = public as $$
declare
  pre text := new.family_id::text || '/' || new.id::text || '/';
  drv text := '^drive:[A-Za-z0-9_-]{10,200}$';
begin
  if exists (
    select 1 from jsonb_array_elements(new.photos) x
    where jsonb_typeof(x) <> 'object'
       or not (coalesce(x->>'path', '') ~ ('^' || pre || '[0-9]+\.jpg$') or coalesce(x->>'path', '') ~ drv)
       or not (coalesce(x->>'thumb', '') ~ ('^' || pre || '[0-9]+_t\.jpg$') or coalesce(x->>'thumb', '') ~ drv)
       or (x ? 'orig' and not (coalesce(x->>'orig', '') ~ ('^' || pre || '[0-9]+_o\.(jpg|png|webp|heic|heif)$')
                              or coalesce(x->>'orig', '') ~ drv))
  ) then
    raise exception 'bad_photo_path';
  end if;
  return new;
end $$;
drop trigger if exists posts_check_photos on public.posts;
create trigger posts_check_photos before insert or update of photos, family_id on public.posts
  for each row execute function public.check_post_photos();

-- ---------- 앱에서 부르는 기능(RPC) ----------

-- 새 앨범 만들기 (카카오·구글로 로그인한 사람만).
-- 처음 하나는 누구나, 그 다음부터는 이미 어떤 앨범의 가족인 사람만 (주소를 우연히 안 낯선 사람이 저장공간을 못 쓰게)
create or replace function public.create_family(
  p_name text, p_baby_name text, p_baby_birthday date, p_display_name text, p_avatar text)
returns public.families language plpgsql security definer set search_path = public as $$
declare
  f public.families;
  tries int := 0;
begin
  if auth.uid() is null or is_guest() then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from families)
     and not exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'create_not_allowed';
  end if;
  loop
    begin
      insert into families (name, baby_name, baby_birthday, invite_code, created_by)
      values (p_name, coalesce(p_baby_name, ''), p_baby_birthday, gen_invite_code(), auth.uid())
      returning * into f;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  insert into members (family_id, user_id, display_name, avatar, role)
  values (f.id, auth.uid(), p_display_name, coalesce(p_avatar, ''), 'owner');
  return f;
end $$;

create or replace function public.invite_info(p_code text)
returns table (name text, baby_name text) language sql stable security definer set search_path = public as $$
  select name, baby_name from families
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.join_family(p_code text, p_display_name text, p_avatar text)
returns public.families language plpgsql security definer set search_path = public as $$
declare
  f public.families;
begin
  if auth.uid() is null or is_guest() then
    raise exception 'not_signed_in';
  end if;
  select * into f from families
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    raise exception 'invalid_code';
  end if;
  insert into members (family_id, user_id, display_name, avatar, role)
  values (f.id, auth.uid(), p_display_name, coalesce(p_avatar, ''), 'member')
  on conflict (family_id, user_id) do nothing;
  return f;
end $$;

create or replace function public.reset_invite_code(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if not is_owner(p_family) then raise exception 'not_owner'; end if;
  update families set invite_code = gen_invite_code() where id = p_family returning invite_code into new_code;
  return new_code;
end $$;

create or replace function public.set_member_role(p_family uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_family) then raise exception 'not_owner'; end if;
  if p_role not in ('owner', 'member') then raise exception 'bad_role'; end if;
  if p_role = 'member' and p_user = auth.uid()
     and (select count(*) from members where family_id = p_family and role = 'owner') <= 1 then
    raise exception 'last_owner';
  end if;
  update members set role = p_role where family_id = p_family and user_id = p_user;
end $$;

-- 가족 내보내기 (관리자만) — 같은 링크로 다시 못 들어오게 초대 코드도 바꿔요
create or replace function public.remove_member(p_family uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if not is_owner(p_family) then raise exception 'not_owner'; end if;
  if p_user = auth.uid() then raise exception 'use_leave'; end if;
  delete from members where family_id = p_family and user_id = p_user;
  update families set invite_code = gen_invite_code() where id = p_family returning invite_code into new_code;
  return new_code;
end $$;

-- 저장공간 사용량 (Supabase 저장소, 프로젝트 전체 — 앨범 가족만)
create or replace function public.storage_usage()
returns bigint language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from members where user_id = auth.uid()) then raise exception 'not_member'; end if;
  return (select coalesce(sum((metadata->>'size')::bigint), 0)::bigint from storage.objects where bucket_id = 'photos');
end $$;

-- 오래된 원본을 게시물 정보에서 빼기 (관리자만). 뺀 경로를 돌려줘요
drop function if exists public.forget_originals(uuid, text[]);
create function public.forget_originals(p_family uuid, p_paths text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  cleared text[];
begin
  if not is_owner(p_family) then raise exception 'not_owner'; end if;
  select coalesce(array_agg(x->>'orig'), '{}') into cleared
  from posts p, jsonb_array_elements(p.photos) x
  where p.family_id = p_family and x->>'orig' = any(p_paths);
  update posts p set photos = (
    select jsonb_agg(case when t.ph->>'orig' = any(p_paths) then t.ph - 'orig' - 'origName' - 'origSize' else t.ph end
                     order by t.i)
    from jsonb_array_elements(p.photos) with ordinality as t(ph, i))
  where p.family_id = p_family
    and exists (select 1 from jsonb_array_elements(p.photos) x where x->>'orig' = any(p_paths));
  return cleared;
end $$;

-- 앨범을 지울 때: 이 앨범 폴더 안의 Supabase 파일 전부 (관리자만)
create or replace function public.family_files(p_family uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner(p_family) then raise exception 'not_owner'; end if;
  return (select coalesce(array_agg(o.name), '{}') from storage.objects o
          where o.bucket_id = 'photos' and o.name like p_family::text || '/%');
end $$;

-- ---------- 접근 권한 ----------

alter table public.families     enable row level security;
alter table public.members      enable row level security;
alter table public.posts        enable row level security;
alter table public.likes        enable row level security;
alter table public.comments     enable row level security;
alter table public.drive_tokens enable row level security;

revoke all on public.families, public.members, public.posts, public.likes, public.comments, public.drive_tokens
  from anon, authenticated;

grant select, delete on public.families to authenticated;
grant update (name, baby_name, baby_birthday, storage) on public.families to authenticated;
grant select, delete on public.members to authenticated;
grant update (display_name, avatar) on public.members to authenticated;
grant select, delete on public.posts to authenticated;
grant insert (id, family_id, caption, taken_at, photos) on public.posts to authenticated;
grant update (caption, taken_at) on public.posts to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.comments to authenticated;
-- drive_tokens: 앱(authenticated)에는 아무 권한도 주지 않아요

revoke execute on function
  public.is_member(uuid), public.is_owner(uuid), public.is_member_path(text), public.is_owner_path(text), public.is_guest(),
  public.gen_invite_code(), public.create_family(text, text, date, text, text), public.invite_info(text),
  public.join_family(text, text, text), public.reset_invite_code(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.storage_usage(), public.forget_originals(uuid, text[]),
  public.family_files(uuid), public.check_post_photos()
  from public, anon;
grant execute on function
  public.is_member(uuid), public.is_owner(uuid), public.is_member_path(text), public.is_owner_path(text), public.is_guest(),
  public.create_family(text, text, date, text, text), public.invite_info(text),
  public.join_family(text, text, text), public.reset_invite_code(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.storage_usage(), public.forget_originals(uuid, text[]),
  public.family_files(uuid)
  to authenticated;

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated using (public.is_member(id));
drop policy if exists families_update on public.families;
create policy families_update on public.families for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
drop policy if exists families_delete on public.families;
create policy families_delete on public.families for delete to authenticated using (public.is_owner(id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_member(family_id));
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(family_id));

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (public.is_member(family_id));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(family_id));
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(family_id));

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select to authenticated using (public.is_member(family_id));
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(family_id));
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated using (public.is_member(family_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(family_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(family_id));

-- ---------- 사진 저장소 (Supabase를 고른 앨범) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 31457280,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member_path(name));
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member_path(name));
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (owner_id = auth.uid()::text or public.is_owner_path(name)));
