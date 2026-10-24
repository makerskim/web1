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
  cover           text not null default '',
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now()
);
-- v1에서 올린 경우를 위해 (여러 번 실행해도 안전)
alter table public.families add column if not exists storage text not null default 'supabase';
alter table public.families add column if not exists drive_folder_id text;
alter table public.families add column if not exists drive_email text;
alter table public.families drop constraint if exists families_storage_check;
alter table public.families add constraint families_storage_check check (storage in ('supabase', 'drive'));
-- 사진·동영상은 이제 언제나 올린 사람의 구글 드라이브에 저장해요 (Supabase 저장소에는 새로 올리지 않아요)
alter table public.families alter column storage set default 'drive';
update public.families set storage = 'drive' where storage <> 'drive';
-- 앨범 사진(가족 탭 맨 위): 비어 있음 / 이 앨범 게시물의 작은 사진 / 관리자가 올린 사진 '가족ID/cover/시각.jpg' / 드라이브 파일
alter table public.families add column if not exists cover text not null default '';
alter table public.families drop constraint if exists families_cover_check;
alter table public.families add constraint families_cover_check check (
  cover = ''
  or cover ~ ('^' || id::text || '/(cover/[0-9]+|[0-9a-f-]{36}/[0-9]+_t)\.jpg$')
  or cover ~ '^(drive|gd):[A-Za-z0-9_-]{10,200}$');
-- 아이들(태명·이름·생일)과 앨범 소개 — 한 명이 기본, 쌍둥이·다둥이는 여러 명
alter table public.families add column if not exists children jsonb not null default '[]';
alter table public.families add column if not exists bio text not null default '';
alter table public.families drop constraint if exists families_bio_check;
alter table public.families add constraint families_bio_check check (char_length(bio) <= 150);
-- 앨범 종류: 아기 앨범(baby) / 가족 앨범(family) / 친구·모임 앨범(group). 가족·모임은 시작일(since, 없으면 만든 날)부터 함께한 날을 세요
alter table public.families add column if not exists kind text not null default 'baby';
alter table public.families drop constraint if exists families_kind_check;
alter table public.families add constraint families_kind_check check (kind in ('baby', 'family', 'group'));
alter table public.families add column if not exists since date;
-- 기념일 (모든 앨범): [{id, name, date 'YYYY-MM-DD', yearly}] 10개까지
alter table public.families add column if not exists days jsonb not null default '[]';
create or replace function public.valid_days(d jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(d) = 'array' and jsonb_array_length(d) <= 10 and pg_column_size(d) < 4000
    and not exists (
      select 1 from jsonb_array_elements(d) x
      where jsonb_typeof(x) <> 'object'
         or char_length(coalesce(x->>'id', '')) > 40
         or jsonb_typeof(x->'name') is distinct from 'string' or char_length(x->>'name') not between 1 and 20
         or jsonb_typeof(x->'date') is distinct from 'string' or (x->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
         or (x ? 'yearly' and jsonb_typeof(x->'yearly') <> 'boolean'))
$$;
alter table public.families drop constraint if exists families_days_check;
alter table public.families add constraint families_days_check check (public.valid_days(days));
create or replace function public.valid_children(c jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(c) = 'array' and jsonb_array_length(c) <= 6 and pg_column_size(c) < 4000
    and not exists (
      select 1 from jsonb_array_elements(c) x
      where jsonb_typeof(x) <> 'object'
         or char_length(coalesce(x->>'id', '')) > 40
         or char_length(coalesce(x->>'nickname', '')) > 20
         or char_length(coalesce(x->>'name', '')) > 20
         or (jsonb_typeof(x->'birthday') = 'string' and (x->>'birthday') !~ '^\d{4}-\d{2}-\d{2}$')
         or (x ? 'birthday' and jsonb_typeof(x->'birthday') not in ('string', 'null'))
         or (x ? 'born' and jsonb_typeof(x->'born') <> 'boolean')
         -- 임신 시작일 (없거나 'YYYY-MM-DD')
         or (jsonb_typeof(x->'start') = 'string' and (x->>'start') !~ '^\d{4}-\d{2}-\d{2}$')
         or (x ? 'start' and jsonb_typeof(x->'start') not in ('string', 'null')))
$$;
alter table public.families drop constraint if exists families_children_check;
alter table public.families add constraint families_children_check check (public.valid_children(children));
-- 예전 앨범은 baby_name·baby_birthday를 첫째 아이로 옮겨요
update public.families
set children = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'nickname', '', 'name', baby_name, 'birthday', baby_birthday,
                                                    'born', baby_birthday is not null and baby_birthday <= current_date))
where children = '[]'::jsonb and (baby_name <> '' or baby_birthday is not null);
-- 아이마다 '태어났는지'를 적어 둬요 (지난 날짜는 생일, 앞으로의 날짜는 출산 예정일)
-- 이렇게 해 두면 예정일이 지나도 '태어났어요'를 누르기 전까지는 태어났다고 하지 않아요
update public.families f
set children = (
  select jsonb_agg(case when x ? 'born' or jsonb_typeof(x->'birthday') <> 'string' then x
                        else x || jsonb_build_object('born', (x->>'birthday') <= to_char(current_date, 'YYYY-MM-DD')) end
                   order by i)
  from jsonb_array_elements(f.children) with ordinality as t(x, i))
where jsonb_typeof(f.children) = 'array' and jsonb_array_length(f.children) > 0
  and exists (select 1 from jsonb_array_elements(f.children) x where not x ? 'born' and jsonb_typeof(x->'birthday') = 'string');

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
-- 얼굴 사진: 비어 있음 / 카카오·구글 프로필 사진 주소 / 내 구글 드라이브에 올린 사진 'gd:파일ID'
-- (예전에 Supabase에 올린 'sb:가족ID/avatars/내ID-시각.jpg'도 그대로 보여요)
alter table public.members alter column avatar set default '';
alter table public.members drop constraint if exists members_avatar_check;
-- v1의 이모지 얼굴(🙂 등)과 'img:' 사진은 새 규칙에 맞지 않아서 비워요 (이름 첫 글자로 보여요)
update public.members set avatar = ''
where not (
  avatar = ''
  or (char_length(avatar) <= 600 and avatar ~ '^https://([a-z0-9-]+\.)*(googleusercontent\.com|kakaocdn\.net|kakao\.com)/')
  or avatar ~ ('^sb:' || family_id::text || '/avatars/' || user_id::text || '-[0-9]+\.jpg$')
  or avatar ~ '^gd:[A-Za-z0-9_-]{10,200}$');
alter table public.members add constraint members_avatar_check check (
  avatar = ''
  or (char_length(avatar) <= 600 and avatar ~ '^https://([a-z0-9-]+\.)*(googleusercontent\.com|kakaocdn\.net|kakao\.com)/')
  or avatar ~ ('^sb:' || family_id::text || '/avatars/' || user_id::text || '-[0-9]+\.jpg$')
  or avatar ~ '^gd:[A-Za-z0-9_-]{10,200}$');

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  author_id  uuid not null default auth.uid(),
  caption    text not null default '' check (char_length(caption) <= 2000),
  taken_at   timestamptz not null default now(),
  -- [{ "path", "thumb", "orig"?, "w", "h", "ph", "dec", "origName"?, "origSize"?, "kind"?: "video", "dur"? }]
  -- 경로: Supabase 저장소면 '가족ID/게시물ID/0.jpg', 올린 사람의 구글 드라이브면 'gd:파일ID'
  -- 동영상은 path·thumb가 첫 장면 사진, orig가 동영상 파일이에요 (구글 드라이브에만)
  photos     jsonb not null check (jsonb_typeof(photos) = 'array'
                                   and jsonb_array_length(photos) between 1 and 10
                                   and pg_column_size(photos) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists posts_family_created_idx on public.posts (family_id, created_at desc);
-- 찍은 날 순 타임라인 · 날짜로 찾기
create index if not exists posts_family_taken_idx on public.posts (family_id, taken_at desc, id desc);

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

-- (예전) 앨범 하나를 관리자 드라이브에 연결하던 정보. 지금은 각자 드라이브(user_drives)를 써요
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
  drv text := '^(drive|gd):[A-Za-z0-9_-]{10,200}$';
begin
  if exists (
    select 1 from jsonb_array_elements(new.photos) x
    where jsonb_typeof(x) <> 'object'
       or not (coalesce(x->>'path', '') ~ ('^' || pre || '[0-9]+\.jpg$') or coalesce(x->>'path', '') ~ drv)
       or not (coalesce(x->>'thumb', '') ~ ('^' || pre || '[0-9]+_t\.jpg$') or coalesce(x->>'thumb', '') ~ drv)
       or (x ? 'orig' and not (coalesce(x->>'orig', '') ~ ('^' || pre || '[0-9]+_o\.(jpg|png|webp|heic|heif)$')
                              or coalesce(x->>'orig', '') ~ drv))
       -- 동영상: 파일은 구글 드라이브에만, 길이는 숫자로
       or (x ? 'kind' and (x->>'kind' <> 'video' or coalesce(x->>'orig', '') !~ '^gd:[A-Za-z0-9_-]{10,200}$'))
       or (x ? 'dur' and jsonb_typeof(x->'dur') <> 'number')
  ) then
    raise exception 'bad_photo_path';
  end if;
  -- 새 게시물은 구글 드라이브 파일만 (예전 게시물은 그대로 둬요)
  if tg_op = 'INSERT' and exists (
    select 1 from jsonb_array_elements(new.photos) x
    where coalesce(x->>'path', '') !~ '^gd:' or coalesce(x->>'thumb', '') !~ '^gd:'
       or (x ? 'orig' and coalesce(x->>'orig', '') !~ '^gd:')
  ) then
    raise exception 'drive_only';
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

-- 돌려주는 칸이 바뀌면 먼저 지워야 해요 (앨범 종류 kind 추가)
drop function if exists public.invite_info(text);
create function public.invite_info(p_code text)
returns table (name text, baby_name text, kind text) language sql stable security definer set search_path = public as $$
  select name, baby_name, kind from families
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

-- 게시물을 지우면, 그 사진을 앨범 사진으로 쓰고 있었을 때 비워요
create or replace function public.clear_cover_on_post_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update families f set cover = ''
  where f.id = old.family_id and f.cover <> ''
    and (f.cover like old.family_id::text || '/' || old.id::text || '/%'
         or f.cover in (select x->>'thumb' from jsonb_array_elements(old.photos) x));
  return null;
end $$;
drop trigger if exists posts_clear_cover on public.posts;
create trigger posts_clear_cover after delete on public.posts
  for each row execute function public.clear_cover_on_post_delete();

-- 마지막 관리자가 나가면(계정 삭제 포함) 가장 먼저 들어온 가족이 관리자가 돼요
create or replace function public.keep_an_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and exists (select 1 from families where id = old.family_id)
     and not exists (select 1 from members where family_id = old.family_id and role = 'owner') then
    update members set role = 'owner'
    where (family_id, user_id) = (select family_id, user_id from members
                                  where family_id = old.family_id order by joined_at limit 1);
  end if;
  return null;
end $$;
drop trigger if exists members_keep_owner on public.members;
create trigger members_keep_owner after delete on public.members
  for each row execute function public.keep_an_owner();

-- 계정을 지우기 전에 (나 혼자 있는 앨범을 지우기 전에) 막히는 게 있는지: 없으면 null
-- 다른 가족이 있고 내가 관리자인 앨범이 내 구글 드라이브를 쓰고 있으면 'drive_connected'
create or replace function public.delete_account_check()
returns text language sql stable security definer set search_path = public as $$
  select case when exists (
    select 1 from drive_tokens t
    join members m on m.family_id = t.family_id and m.user_id = t.connected_by and m.role = 'owner'
    where t.connected_by = auth.uid()
      and exists (select 1 from members o where o.family_id = t.family_id and o.user_id <> t.connected_by)
  ) then 'drive_connected' end
$$;

-- 계정을 지우면 내 구글 드라이브 연결이 풀리는 앨범들 (이제 관리자가 아니거나 나간 앨범)
-- 그 앨범의 드라이브 사진은 가족이 더 이상 볼 수 없게 돼요 → 지우기 전에 알려 줘요
create or replace function public.drive_links_to_release()
returns setof text language sql stable security definer set search_path = public as $$
  select f.name from drive_tokens t join families f on f.id = t.family_id
  where t.connected_by = auth.uid()
    and not exists (select 1 from members m where m.family_id = t.family_id and m.user_id = auth.uid() and m.role = 'owner')
  order by f.name
$$;

-- 계정 삭제: 나 혼자 있는 앨범은 앱에서 먼저 지워야 해요 (사진 파일 정리)
-- 올린 사진·댓글은 가족 앨범에 남아요
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from members m where m.user_id = auth.uid()
             and not exists (select 1 from members o where o.family_id = m.family_id and o.user_id <> m.user_id)) then
    raise exception 'sole_member';
  end if;
  -- 내가 관리자로 있는 앨범이 내 구글 드라이브를 쓰고 있으면 먼저 연결을 끊어야 해요
  if public.delete_account_check() is not null then
    raise exception 'drive_connected';
  end if;
  -- 이미 나갔거나 관리자가 아닌 앨범에 남은 내 드라이브 연결은 여기서 끊어요 (지운 사람의 드라이브를 계속 쓰지 않게)
  update families set storage = 'supabase', drive_email = null
    where id in (select family_id from drive_tokens where connected_by = auth.uid());
  delete from drive_tokens where connected_by = auth.uid();
  delete from likes where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- 각자 구글 드라이브 ----------
-- 사진·동영상은 올린 사람의 구글 드라이브 'Pastel Memories/앨범이름' 폴더에 앱이 바로 올려요 (게시물에는 'gd:파일ID')
-- 연결 정보(갱신 토큰)는 서버 기능(Edge Function)만 읽어요. folders: { 앨범ID: { "id": 폴더, "small": 앱용 작은 사진 폴더 } }
create table if not exists public.user_drives (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  email         text,
  root_folder   text,
  folders       jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- 내 드라이브 연결 상태 (토큰은 빼고): 연결 안 했으면 빈 결과
create or replace function public.my_drive()
returns table (email text, root_folder text) language sql stable security definer set search_path = public as $$
  select d.email, d.root_folder from user_drives d where d.user_id = auth.uid()
$$;

-- ---------- 알림 ----------
-- 휴대폰마다 하나 (같은 휴대폰에서 다른 계정으로 바꾸면 새 계정으로 옮겨요). prefs: 새 사진 · 댓글 · 기념일·추억
create table if not exists public.push_subs (
  endpoint   text primary key check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) < 200),
  auth       text not null check (char_length(auth) < 100),
  prefs      jsonb not null default '{"post": true, "comment": true, "daily": true}',
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);

create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if jsonb_typeof(p_prefs) <> 'object' or pg_column_size(p_prefs) > 400 then raise exception 'bad_prefs'; end if;
  delete from push_subs where endpoint = p_endpoint and user_id <> auth.uid();
  insert into push_subs (endpoint, user_id, p256dh, auth, prefs) values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_prefs)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs;
end $$;

create or replace function public.drop_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.my_push(p_endpoint text)
returns jsonb language sql stable security definer set search_path = public as $$
  select prefs from push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- 서버 기능이 쓰는 열쇠(알림 서명 키, 매일 알림 비밀값)와 보낸 기록 — 앱에서는 못 읽어요
create table if not exists public.app_keys (name text primary key, value jsonb not null);
insert into public.app_keys (name, value) values ('cron', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
  on conflict (name) do nothing;
create table if not exists public.push_sent (key text primary key, at timestamptz not null default now());

-- N년 전 오늘 (찍은 날 기준, 오늘 이전 해들)
create or replace function public.on_this_day(p_family uuid, p_month int, p_day int, p_tz text default 'Asia/Seoul')
returns setof public.posts language sql stable set search_path = public as $$
  select p.* from posts p
  where p.family_id = p_family
    and extract(month from p.taken_at at time zone p_tz) = p_month
    and extract(day from p.taken_at at time zone p_tz) = p_day
    and (p.taken_at at time zone p_tz)::date < (now() at time zone p_tz)::date
  order by p.taken_at desc limit 200
$$;

-- ---------- 접근 권한 ----------

alter table public.families     enable row level security;
alter table public.members      enable row level security;
alter table public.posts        enable row level security;
alter table public.likes        enable row level security;
alter table public.comments     enable row level security;
alter table public.drive_tokens enable row level security;
alter table public.user_drives  enable row level security;
alter table public.push_subs    enable row level security;
alter table public.app_keys     enable row level security;
alter table public.push_sent    enable row level security;

revoke all on public.families, public.members, public.posts, public.likes, public.comments, public.drive_tokens,
  public.user_drives, public.push_subs, public.app_keys, public.push_sent
  from anon, authenticated;

grant select, delete on public.families to authenticated;
grant update (name, baby_name, baby_birthday, storage, cover, children, bio, kind, since, days) on public.families to authenticated;
grant select, delete on public.members to authenticated;
grant update (display_name, avatar) on public.members to authenticated;
grant select, delete on public.posts to authenticated;
grant insert (id, family_id, caption, taken_at, photos) on public.posts to authenticated;
grant update (caption, taken_at) on public.posts to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.comments to authenticated;
-- drive_tokens · user_drives · push_subs · app_keys · push_sent: 앱은 표를 직접 못 써요 (위의 기능으로만)

revoke execute on function
  public.is_member(uuid), public.is_owner(uuid), public.is_member_path(text), public.is_owner_path(text), public.is_guest(),
  public.gen_invite_code(), public.create_family(text, text, date, text, text), public.invite_info(text),
  public.join_family(text, text, text), public.reset_invite_code(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.storage_usage(), public.forget_originals(uuid, text[]),
  public.family_files(uuid), public.check_post_photos(), public.clear_cover_on_post_delete(), public.keep_an_owner(),
  public.delete_account_check(), public.drive_links_to_release(), public.delete_account(),
  public.my_drive(), public.save_push(text, text, text, jsonb), public.drop_push(text), public.my_push(text),
  public.on_this_day(uuid, int, int, text)
  from public, anon;
grant execute on function
  public.is_member(uuid), public.is_owner(uuid), public.is_member_path(text), public.is_owner_path(text), public.is_guest(),
  public.create_family(text, text, date, text, text), public.invite_info(text),
  public.join_family(text, text, text), public.reset_invite_code(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.storage_usage(), public.forget_originals(uuid, text[]),
  public.family_files(uuid), public.delete_account_check(), public.drive_links_to_release(), public.delete_account(),
  public.my_drive(), public.save_push(text, text, text, jsonb), public.drop_push(text), public.my_push(text),
  public.on_this_day(uuid, int, int, text)
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

-- ---------- 예전 사진 저장소 (Supabase) ----------
-- 예전에 올린 사진을 보고 지울 수만 있어요. 새 사진·동영상은 각자의 구글 드라이브에 올려요

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 31457280,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member_path(name));
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (owner_id = auth.uid()::text or public.is_owner_path(name)));
