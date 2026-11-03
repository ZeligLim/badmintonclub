-- Local Supabase auth fails to scan NULL string columns in auth.users
-- ("converting NULL to string is unsupported"), which surfaces as
-- "Database error finding user" during sign-in. Normalize any NULL text
-- fields introduced by older data so OTP sign-in works.
update auth.users
set
  aud = coalesce(aud, ''),
  role = coalesce(role, ''),
  email = coalesce(email, ''),
  encrypted_password = coalesce(encrypted_password, ''),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
where
  aud is null
  or role is null
  or email is null
  or encrypted_password is null
  or confirmation_token is null
  or recovery_token is null
  or email_change_token_new is null
  or email_change is null
  or email_change_token_current is null
  or reauthentication_token is null
  or raw_app_meta_data is null
  or raw_user_meta_data is null;
