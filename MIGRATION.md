# NextAuth to Better Auth Migration

## Overview

This PR migrates the authentication system from NextAuth v5 to Better Auth.

## Changes Made

### New Files Created

1. **`lib/auth.ts`** - Better Auth server configuration
   - Configured MongoDB adapter
   - Set up GitHub and Google OAuth providers
   - Disabled email/password authentication (not used in original setup)

2. **`lib/auth-client.ts`** - Better Auth client exports
   - Exports `signIn`, `signOut`, and `useSession` for client components

3. **`lib/getAuthUser.ts`** - Migrated auth user utility
   - Moved from `app/api/auth/[...nextauth]/getAuthUser.tsx`
   - Updated to use Better Auth session API

4. **`app/api/auth/[...all]/route.ts`** - New Better Auth API route
   - Replaces `app/api/auth/[...nextauth]/route.ts`

### Modified Files

1. **`app/auth/login/page.tsx`**
   - Updated imports from `next-auth/react` to `@/lib/auth-client`
   - Updated `signIn()` calls to use Better Auth's `signIn.social({ provider })` syntax

2. **`package.json`**
   - Added `better-auth@^1.3.28`
   - Kept `next-auth` for now (can be removed after testing)

3. **`.env.example`**
   - Added Better Auth environment variable documentation

### Files to Deprecate (After Testing)

- `app/api/auth/[...nextauth]/auth.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/auth/[...nextauth]/getAuthUser.tsx`
- `app/api/auth/[...nextauth]/Users.tsx` (if not used elsewhere)

## Environment Variables

Better Auth uses the same environment variables as NextAuth for OAuth providers:

- `AUTH_GITHUB_ID` - GitHub OAuth client ID
- `AUTH_GITHUB_SECRET` - GitHub OAuth client secret
- `AUTH_GOOGLE_ID` - Google OAuth client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret

Additional Better Auth-specific variables:

- `BETTER_AUTH_SECRET` - Secret key for session encryption (optional in dev)
- `BETTER_AUTH_URL` - Base URL for the application (optional, defaults to localhost:3000)
- `NEXT_PUBLIC_APP_URL` - Public URL for client-side auth (optional)

## Testing Checklist

- [ ] GitHub OAuth login works
- [ ] Google OAuth login works
- [ ] Session persistence across page refreshes
- [ ] Admin role assignment (@comfy.org and @drip.art emails)
- [ ] Sign out functionality
- [ ] Protected routes/pages still work
- [ ] User data in MongoDB is correctly associated

## Breaking Changes

### API Changes

1. **Session Object Structure**: Better Auth may have a different session object structure. Review all places where `session.user` is accessed.

2. **Server-side Session Access**: Changed from:

   ```ts
   const session = await auth();
   ```

   to:

   ```ts
   const session = await auth.api.getSession({ headers });
   ```

3. **Client-side Sign In**: Changed from:
   ```ts
   signIn("google");
   ```
   to:
   ```ts
   signIn.social({ provider: "google" });
   ```

## Migration Steps

1. Install Better Auth: ✅
2. Create Better Auth configuration: ✅
3. Update API routes: ✅
4. Update client components: ✅
5. Test authentication flows: ⏳
6. Remove old NextAuth files: ⏳
7. Update documentation: ⏳

## Rollback Plan

If issues are encountered:

1. Revert changes to `app/auth/login/page.tsx`
2. Remove `app/api/auth/[...all]/` directory
3. Remove `lib/auth.ts` and `lib/auth-client.ts`
4. Restore imports to use NextAuth
5. Remove `better-auth` from package.json

## Notes

- The MongoDB adapter connection is shared with the existing setup
- Admin role logic remains unchanged
- Better Auth provides a more modern and actively maintained alternative to NextAuth v5
