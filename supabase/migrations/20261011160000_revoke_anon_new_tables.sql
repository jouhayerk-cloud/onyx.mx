-- APPLIED 2026-10-10 with Ramses approval (dry run first; verified: no anon grants left on these objects).
-- 2026-10-10 - revoke the default anon privileges from the tables and view added for Siri tokens, the audit log and the document ledger.
-- Why: Supabase grants the anon role ALL privileges on new public tables by default. Row level security has no anon policy on these
-- tables, so anon was already denied, but a missing grant is a second layer: a future policy mistake cannot open them to anon.
-- Effect: none for the app or the functions (the app uses authenticated, the Edge Functions use the service role).
-- Rollback: grant the privileges back to anon (not recommended).
begin;

revoke all on public.siri_tokens          from anon;
revoke all on public.onyxchan_audit       from anon;
revoke all on public.document_jobs        from anon;
revoke all on public.document_job_events  from anon;
revoke all on public.document_job_items   from anon;
revoke all on public.document_jobs_current from anon;

-- the view is read only: authenticated needs select only (its tables already refuse update, delete and truncate)
revoke insert, update, delete, truncate on public.document_jobs_current from authenticated;

commit;
