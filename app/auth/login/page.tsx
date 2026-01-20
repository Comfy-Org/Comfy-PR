"use client";

import { signIn } from "@/lib/auth-client";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

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
            onClick={() => signIn.social({ provider: "google" })}
            className="flex items-center justify-center w-full py-3 px-4 border-2 border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md group"
          >
            <FcGoogle className="w-6 h-6 mr-3" />
            <span className="font-medium text-gray-700 group-hover:text-gray-900">Continue with Google</span>
          </button>

          {/* GitHub OAuth Button */}
          <button
            onClick={() => signIn.social({ provider: "github" })}
            className="flex items-center justify-center w-full py-3 px-4 border-2 border-gray-800 bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md group"
          >
            <FaGithub className="w-6 h-6 mr-3 text-white" />
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
