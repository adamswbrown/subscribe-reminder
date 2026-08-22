-- Trigger functions are invoked by triggers only; remove them from the RPC surface.
revoke execute on function public.handle_subscription_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
