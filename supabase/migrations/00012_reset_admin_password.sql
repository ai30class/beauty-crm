CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

UPDATE auth.users SET encrypted_password = extensions.crypt('Test1234!', extensions.gen_salt('bf')) WHERE email = 'test@test.com';