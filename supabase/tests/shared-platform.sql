-- Run as database owner against a disposable local database. All fixtures roll back.
begin;
select set_config('crew_test.community',(select crew_id::text from public.community_settings where singleton),true);
select set_config('crew_test.user',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at)
values(current_setting('crew_test.user')::uuid,'unconfirmed-platform-test@example.invalid','{}','{}',null);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('crew_test.user'),true);
do $$begin
 if public.is_member(current_setting('crew_test.community')::uuid) then raise exception 'Unconfirmed account was enrolled';end if;
 begin
  perform public.ensure_community_membership();
 exception when raise_exception then
  if sqlerrm='Bevestig eerst je e-mailadres' then return;end if;
  raise;
 end;
 raise exception 'Unconfirmed account could enroll';
end$$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('crew_test.user')::uuid;
set local role authenticated;
do $$begin
 if public.ensure_community_membership()<>current_setting('crew_test.community')::uuid then raise exception 'Wrong platform after confirmation';end if;
 if not public.is_member(current_setting('crew_test.community')::uuid) then raise exception 'Confirmed account was not enrolled';end if;
 if not exists(select 1 from public.members where user_id=auth.uid() and crew_id=current_setting('crew_test.community')::uuid and role='member') then raise exception 'Unexpected administrator rights';end if;
 if exists(select 1 from public.consents where user_id=auth.uid() and sharing) then raise exception 'Sharing unexpectedly enabled';end if;
end$$;
-- The final administrator's account can be deleted without deleting the platform.
reset role;
do $$declare temporary_community uuid;begin
 insert into public.crews(name) values('Disposable account-deletion fixture') returning id into temporary_community;
 perform set_config('crew_test.temporary_community',temporary_community::text,true);
 update public.community_settings set crew_id=temporary_community where singleton;
 insert into public.members(crew_id,user_id,role) values(temporary_community,current_setting('crew_test.user')::uuid,'admin');
 insert into public.consents(crew_id,user_id,sharing) values(temporary_community,current_setting('crew_test.user')::uuid,false);
end$$;
set local role authenticated;
select public.delete_my_account();
reset role;
do $$begin
 if not exists(select 1 from public.crews where id=current_setting('crew_test.temporary_community')::uuid) then raise exception 'Shared platform was deleted';end if;
 if exists(select 1 from auth.users where id=current_setting('crew_test.user')::uuid) then raise exception 'Account deletion failed';end if;
end$$;
rollback;
