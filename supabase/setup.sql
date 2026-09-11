-- Nanda Boutique: execute no SQL Editor do SEU projeto Supabase.
-- 1. Mantenha Authentication > Email > Confirm email ATIVADO.
-- 2. Cadastre o domínio HTTPS em Site URL e Redirect URLs.
-- 3. Crie/convide a conta usenandaboutiquee@gmail.com pelo Dashboard antes de
--    abrir os cadastros ao público; confirme o e-mail. Senha apenas no Auth.
-- 4. Copie URL e chave PUBLICÁVEL para config.js. Nunca use service_role/secret.
-- O schema nanda_private NÃO deve ser adicionado a Exposed schemas da Data API.
-- Não há CPF nesta base; e-mails das avaliações ficam somente em schema privado.

begin;

create schema if not exists nanda_private;
revoke all on schema nanda_private from public;
grant usage on schema nanda_private to anon, authenticated;

create or replace function nanda_private.is_store_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from auth.users as u
        where u.id = auth.uid()
          and lower(u.email) = 'usenandaboutiquee@gmail.com'
          and u.email_confirmed_at is not null
          and coalesce(u.is_anonymous, false) = false
          and (u.banned_until is null or u.banned_until < now())
    );
$$;
revoke all on function nanda_private.is_store_admin() from public, anon, authenticated;
grant execute on function nanda_private.is_store_admin() to authenticated;

-- Public RPC is an invoker wrapper. Elevated code stays in the private schema.
create or replace function public.is_store_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select nanda_private.is_store_admin(); $$;
revoke all on function public.is_store_admin() from public, anon, authenticated;
grant execute on function public.is_store_admin() to authenticated;

create table if not exists public.boutique_store (
    id text primary key check (id = 'main'),
    payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152),
    updated_at timestamptz not null default now()
);
alter table public.boutique_store enable row level security;
revoke all on public.boutique_store from public, anon, authenticated;
grant select on public.boutique_store to anon, authenticated;
grant insert, update on public.boutique_store to authenticated;

create or replace function nanda_private.touch_store()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
revoke all on function nanda_private.touch_store() from public, anon, authenticated;
drop trigger if exists boutique_store_updated_at on public.boutique_store;
create trigger boutique_store_updated_at before update on public.boutique_store
for each row execute function nanda_private.touch_store();

drop policy if exists boutique_store_read on public.boutique_store;
create policy boutique_store_read on public.boutique_store for select to anon, authenticated using (true);
drop policy if exists boutique_store_insert on public.boutique_store;
create policy boutique_store_insert on public.boutique_store for insert to authenticated
with check ((select nanda_private.is_store_admin()));
drop policy if exists boutique_store_update on public.boutique_store;
create policy boutique_store_update on public.boutique_store for update to authenticated
using ((select nanda_private.is_store_admin())) with check ((select nanda_private.is_store_admin()));

create table if not exists nanda_private.boutique_reviews (
    id bigint primary key check (id > 0 and id <= 9007199254740991),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    email_key text not null unique,
    display_name text not null check (char_length(display_name) between 1 and 80),
    stars smallint not null check (stars between 1 and 5),
    comment text not null check (char_length(comment) between 3 and 1000),
    created_at timestamptz not null default now()
);
alter table nanda_private.boutique_reviews enable row level security;
revoke all on nanda_private.boutique_reviews from public, anon, authenticated;

-- Only the account's own opaque owner ID is returned; private email never leaves.
create or replace function nanda_private.list_reviews()
returns table (id bigint, owner_id uuid, display_name text, stars smallint, comment text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
    select r.id, case when r.user_id = auth.uid() then r.user_id else null end,
           r.display_name, r.stars, r.comment, r.created_at
    from nanda_private.boutique_reviews r
    order by r.created_at desc
    limit 500;
$$;
revoke all on function nanda_private.list_reviews() from public, anon, authenticated;
grant execute on function nanda_private.list_reviews() to anon, authenticated;

create or replace function public.boutique_list_reviews()
returns table (id bigint, owner_id uuid, display_name text, stars smallint, comment text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from nanda_private.list_reviews(); $$;
revoke all on function public.boutique_list_reviews() from public, anon, authenticated;
grant execute on function public.boutique_list_reviews() to anon, authenticated;

create or replace function nanda_private.submit_review(review_id bigint, review_stars integer, review_comment text)
returns table (id bigint, owner_id uuid, display_name text, stars smallint, comment text, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
    account_id uuid;
    account_email text;
    account_name text;
begin
    select u.id, lower(u.email),
        left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), 'Cliente'), 80)
    into account_id, account_email, account_name
    from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and u.email is not null and coalesce(u.is_anonymous, false) = false
      and (u.banned_until is null or u.banned_until < now());

    if account_id is null then raise insufficient_privilege using message = 'Conta confirmada necessária.'; end if;
    if review_id is null or review_id < 1 or review_id > 9007199254740991 or review_stars is null
       or review_stars < 1 or review_stars > 5 or review_comment is null
       or char_length(btrim(review_comment)) < 3 or char_length(btrim(review_comment)) > 1000 then
        raise check_violation using message = 'Avaliação inválida.';
    end if;

    insert into nanda_private.boutique_reviews(id, user_id, email_key, display_name, stars, comment)
    values (review_id, account_id, account_email, account_name, review_stars::smallint, btrim(review_comment));

    return query select r.id, r.user_id, r.display_name, r.stars, r.comment, r.created_at
    from nanda_private.boutique_reviews r where r.id = review_id and r.user_id = account_id;
end;
$$;
revoke all on function nanda_private.submit_review(bigint, integer, text) from public, anon, authenticated;
grant execute on function nanda_private.submit_review(bigint, integer, text) to authenticated;

create or replace function public.boutique_submit_review(review_id bigint, review_stars integer, review_comment text)
returns table (id bigint, owner_id uuid, display_name text, stars smallint, comment text, created_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from nanda_private.submit_review(review_id, review_stars, review_comment); $$;
revoke all on function public.boutique_submit_review(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.boutique_submit_review(bigint, integer, text) to authenticated;

create or replace function nanda_private.delete_review(review_id bigint)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare changed integer;
begin
    if auth.uid() is null then raise insufficient_privilege using message = 'Conta necessária.'; end if;
    delete from nanda_private.boutique_reviews r where r.id = review_id and r.user_id = auth.uid();
    get diagnostics changed = row_count;
    return changed = 1;
end;
$$;
revoke all on function nanda_private.delete_review(bigint) from public, anon, authenticated;
grant execute on function nanda_private.delete_review(bigint) to authenticated;

create or replace function public.boutique_delete_review(review_id bigint)
returns boolean language sql security invoker set search_path = ''
as $$ select nanda_private.delete_review(review_id); $$;
revoke all on function public.boutique_delete_review(bigint) from public, anon, authenticated;
grant execute on function public.boutique_delete_review(bigint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boutique-media', 'boutique-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists boutique_media_select on storage.objects;
create policy boutique_media_select on storage.objects for select to authenticated
using (bucket_id = 'boutique-media' and (select nanda_private.is_store_admin()));
drop policy if exists boutique_media_insert on storage.objects;
create policy boutique_media_insert on storage.objects for insert to authenticated
with check (bucket_id = 'boutique-media' and (select nanda_private.is_store_admin()));
drop policy if exists boutique_media_update on storage.objects;
create policy boutique_media_update on storage.objects for update to authenticated
using (bucket_id = 'boutique-media' and (select nanda_private.is_store_admin()))
with check (bucket_id = 'boutique-media' and (select nanda_private.is_store_admin()));
drop policy if exists boutique_media_delete on storage.objects;
create policy boutique_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'boutique-media' and (select nanda_private.is_store_admin()));

commit;

-- Teste no site com: visitante, cliente confirmado e dona confirmada.
-- Trocar localStorage.userRole ou user_metadata não muda as políticas do banco.
-- Catálogo/imagens são públicos. Edição e upload exigem a identidade da dona.
-- Uma avaliação por usuário e e-mail verificado; exclusão somente pelo autor.
