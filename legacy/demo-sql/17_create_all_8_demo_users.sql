-- 17_create_all_8_demo_users.sql
-- Creates all 8 authentic demo user accounts in Supabase Auth & Profiles
-- Password for all 8 users: SolarFlow@2026

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_users JSONB := '[
    {
      "email": "admin@solarflow.demo",
      "name": "Demo Admin",
      "user_type": "admin",
      "role": "Admin",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "office@solarflow.demo",
      "name": "Demo Office",
      "user_type": "sales",
      "role": "Office",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "cpo@solarflow.demo",
      "name": "Demo Aurora Solar (CPO)",
      "user_type": "channel_partner_office",
      "role": "Channel Partner Office",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "manager@solarflow.demo",
      "name": "Demo Manager",
      "user_type": "office2",
      "role": "Channel Partner Manager",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "dealer@solarflow.demo",
      "name": "Demo Dealer",
      "user_type": "agent2",
      "role": "Channel Partner",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "partner@solarflow.demo",
      "name": "Demo Partner",
      "user_type": "agent",
      "role": "Channel Partners",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "vendor@solarflow.demo",
      "name": "Vendor 1",
      "user_type": "vendor",
      "role": "Vendors",
      "channel_partner": "Demo Aurora Solar"
    },
    {
      "email": "stamp@solarflow.demo",
      "name": "Demo Stamp",
      "user_type": "stamp",
      "role": "Stamp",
      "channel_partner": "Demo Aurora Solar"
    }
  ]'::jsonb;

  v_item jsonb;
  v_user_id uuid;
  v_existing_id uuid;
  v_pw_hash text := crypt('SolarFlow@2026', gen_salt('bf'));
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_users)
  LOOP
    -- Check if user already exists by email
    SELECT id INTO v_existing_id FROM auth.users WHERE email = (v_item->>'email');

    IF v_existing_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        (v_item->>'email'),
        v_pw_hash,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'name', (v_item->>'name'),
          'role', (v_item->>'role'),
          'user_type', (v_item->>'user_type')
        ),
        now(),
        now()
      );
    ELSE
      v_user_id := v_existing_id;
      UPDATE auth.users
      SET encrypted_password = v_pw_hash,
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- Upsert profile record matching the user ID and demo_session_id
    INSERT INTO public.profiles (
      id, demo_session_id, name, email, user_type, role, channel_partner, status
    ) VALUES (
      v_user_id,
      v_user_id,
      (v_item->>'name'),
      (v_item->>'email'),
      (v_item->>'user_type'),
      (v_item->>'role'),
      (v_item->>'channel_partner'),
      'active'
    )
    ON CONFLICT (id) DO UPDATE SET
      user_type = EXCLUDED.user_type,
      role = EXCLUDED.role,
      name = EXCLUDED.name,
      status = 'active',
      channel_partner = EXCLUDED.channel_partner;

    -- Pre-populate demo CRM data for this account if start_demo_session exists
    IF to_regprocedure('public.start_demo_session(text)') IS NOT NULL THEN
      BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
        PERFORM public.start_demo_session(v_item->>'user_type');
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Notice: Initializing session for % skipped: %', (v_item->>'email'), SQLERRM;
      END;
    END IF;

  END LOOP;

  -- Restore previous setting
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
END $$;
