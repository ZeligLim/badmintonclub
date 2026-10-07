revoke all on function public.finalize_due_sessions()
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_due_sessions() to authenticated;
