'use client';

import { XCircle, RotateCcw, Home } from 'lucide-react';

interface ErrorScreenProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

export default function ErrorScreen({ message, onRetry, onCancel }: ErrorScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col items-center justify-center p-8">
      {/* Error Icon */}
      <div className="mb-8">
        <XCircle className="w-48 h-48 text-red-500" strokeWidth={1.5} />
      </div>

      {/* Error Title */}
      <h1 className="text-5xl font-bold text-gray-800 mb-4">
        Oops!
      </h1>

      {/* Error Message */}
      <p className="text-2xl text-gray-600 text-center max-w-md mb-4">
        {message}
      </p>

      {/* Help Text */}
      <p className="text-lg text-gray-400 mb-12">
        Need help? Contact reception
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col gap-4 w-80">
        <button
          onClick={onRetry}
          className="kiosk-button kiosk-button-secondary h-20 text-2xl gap-3"
        >
          <RotateCcw className="w-8 h-8" />
          Try Again
        </button>

        <button
          onClick={onCancel}
          className="kiosk-button kiosk-button-gray h-20 text-2xl gap-3"
        >
          <Home className="w-8 h-8" />
          Cancel
        </button>
      </div>
    </div>
  );
}
