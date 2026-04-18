"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

/**
 * Login page for Comfy PR
 * Provides Google and GitHub OAuth authentication
 *
 * Authorization Requirements:
 * - Google OAuth: Must have @comfy.org email to access admin pages
 * - GitHub OAuth: Must be member of github.com/Comfy-Org
 */
export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-96 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Comfy PR</h1>
          <p className="text-gray-600">Sign in to access the system</p>
        </div>

        <div className="space-y-4">
          {/* Google OAuth Button */}
          <button
            onClick={() => signIn("google")}
            className="flex items-center justify-center w-full py-3 px-4 border-2 border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md group"
          >
            <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <span className="font-medium text-gray-700 group-hover:text-gray-900">
              Continue with Google
            </span>
          </button>

          {/* GitHub OAuth Button */}
          <button
            onClick={() => signIn("github")}
            className="flex items-center justify-center w-full py-3 px-4 border-2 border-gray-800 bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md group"
          >
            <Github className="w-6 h-6 mr-3 text-white" />
            <span className="font-medium text-white">Continue with GitHub</span>
          </button>
        </div>

        {/* Authorization Notice */}
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Pre-authorized users only</h3>
          <div className="text-xs text-amber-700 space-y-1">
            <p>
              <strong>Google:</strong> Requires @comfy.org email for admin access
            </p>
            <p>
              <strong>GitHub:</strong> Must be member of Comfy-Org organization
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
